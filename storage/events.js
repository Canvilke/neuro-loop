/**
 * storage/events.js —— L1 真源（append-only jsonl）的读写，以及按月折叠出来的快照。
 *
 * 职责：定位目录、追加事件、按月读取、坏行计数、快照读写、把归档月份的原文 gzip 掉。
 * 不负责：校验（core/events.js）、折叠逻辑（core/compact.js）、投影（storage/projection.js）。
 * 依赖：core/events.js、core/compact.js、storage/legacy.js
 *
 * 布局：
 *   %USERPROFILE%\.dsh\neuro-loop\events-YYYY-MM.jsonl        事件原文（真源）
 *   %USERPROFILE%\.dsh\neuro-loop\snapshot-YYYY-MM.json       该月及之前的累计前缀态
 *   %USERPROFILE%\.dsh\neuro-loop\archive\events-YYYY-MM.jsonl.gz  已折叠月份的原文（不删，只压）
 * 测试用 NEUROLOOP_HOME 覆盖根目录（每次调用都读环境变量，不在 import 时固化）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { DomainError, check } from '../core/contract.js';
import { isSnapshot, monthOfFile, snapshotFileName } from '../core/compact.js';
import { normalizeEvent, toLine } from '../core/events.js';
import { fromLegacy } from './legacy.js';

const FILE_RE = /^events-(\d{4})-(\d{2})\.jsonl$/;
const ARCHIVE_RE = /^events-(\d{4})-(\d{2})\.jsonl\.gz$/;

/**
 * 数据根目录。
 * @returns {string}
 */
export function rootDir() {
  return process.env.NEUROLOOP_HOME
    ? path.resolve(process.env.NEUROLOOP_HOME)
    : path.join(os.homedir(), '.dsh', 'neuro-loop');
}

/**
 * 确保目录存在。
 * @returns {string}
 */
export function ensureRoot() {
  const dir = rootDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 某时间点所属的月份文件名。
 * @param {string|Date} when
 * @returns {string}
 */
export function monthFile(when) {
  const d = when instanceof Date ? when : new Date(when);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `events-${y}-${m}.jsonl`;
}

/**
 * 追加一条**已规范化**事件。
 * 只 append，不改写；断电最多丢最后一行，而那一行会被读端当坏行跳过。
 * @param {object} ev
 * @returns {{file:string, bytes:number}}
 */
export function append(ev) {
  const dir = ensureRoot();
  const line = `${toLine(ev)}\n`;
  const file = path.join(dir, monthFile(ev.at));
  fs.appendFileSync(file, line, 'utf8');
  return { file, bytes: Buffer.byteLength(line) };
}

/**
 * 列出事件文件，按年月升序。
 * @returns {string[]} 绝对路径
 */
export function listFiles() {
  const dir = rootDir();
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => FILE_RE.test(n));
  } catch {
    return [];
  }
  return names.sort().map((n) => path.join(dir, n));
}

/**
 * 列出快照文件，按月份升序。
 * @returns {{month:string, file:string}[]}
 */
export function listSnapshots() {
  const dir = rootDir();
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => monthOfFile(n) && n.startsWith('snapshot-'));
  } catch {
    return [];
  }
  return names
    .sort()
    .map((n) => ({ month: monthOfFile(n), file: path.join(dir, n) }));
}

/**
 * 读一个快照；文件不在 / JSON 坏 / 形状不对，一律返回 null（调用方当没有快照处理）。
 * @param {string} file
 * @returns {object|null}
 */
export function readSnapshot(file) {
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return isSnapshot(parsed) ? parsed : null;
}

/**
 * 原子写快照（临时文件 + rename，断电不会留下半截 JSON）。
 * 同一月份允许重写：崩溃恢复时要能重放这一步。
 * @param {object} snap
 * @returns {{file:string, bytes:number}}
 */
export function writeSnapshot(snap) {
  check(isSnapshot(snap), 'bad-snapshot', `快照形状不对：${snap?.month ?? '(无)'}`);
  const dir = ensureRoot();
  const file = path.join(dir, snapshotFileName(snap.month));
  const text = `${JSON.stringify(snap)}\n`;
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
  return { file, bytes: Buffer.byteLength(text) };
}

/**
 * 归档目录。
 * @returns {string}
 */
export function archiveDir() {
  return path.join(rootDir(), 'archive');
}

/**
 * 列出已归档的月份，按月份升序。
 * @returns {{month:string, file:string}[]}
 */
export function listArchives() {
  const dir = archiveDir();
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => ARCHIVE_RE.test(n));
  } catch {
    return [];
  }
  return names.sort().map((n) => {
    const m = ARCHIVE_RE.exec(n);
    return { month: `${m[1]}-${m[2]}`, file: path.join(dir, n) };
  });
}

/**
 * 把某月的事件原文 gzip 进 `archive/`，校验解压后与原文逐字节相同，再删掉根目录那份。
 *
 * 为什么不是"直接删"：AGENTS.md 铁律是"不删数据家目录"。压缩后原文仍可完整还原，
 * 而根目录那个月不再参与日常读取，省的是读放大。
 * @param {string} month YYYY-MM
 * @returns {{month:string, file:string, archive:string, bytes:number, gzBytes:number}|null} 没有该月文件返回 null
 */
export function archiveMonth(month) {
  check(/^\d{4}-\d{2}$/.test(String(month)), 'bad-archive-month', `月份形状不对：${month}`);
  const dir = ensureRoot();
  const src = path.join(dir, `events-${month}.jsonl`);
  if (!fs.existsSync(src)) return null;

  const adir = archiveDir();
  fs.mkdirSync(adir, { recursive: true });
  const dst = path.join(adir, `events-${month}.jsonl.gz`);
  if (fs.existsSync(dst)) {
    throw new DomainError('archive-exists', `已存在归档，不覆盖：${dst}`);
  }

  const raw = fs.readFileSync(src);
  fs.writeFileSync(dst, zlib.gzipSync(raw, { level: 9 }));
  const back = zlib.gunzipSync(fs.readFileSync(dst));
  if (!back.equals(raw)) {
    throw new DomainError('archive-verify', `解压后与原文不一致，已保留原文件：${month}`);
  }
  fs.unlinkSync(src);
  return {
    month,
    file: src,
    archive: dst,
    bytes: raw.length,
    gzBytes: fs.statSync(dst).size,
  };
}

/**
 * 把一行变成规范事件；坏行/未知类型返回 null。
 * 同时兼容 v1（短字段）与 v2（`v:2`）两种行。
 * @param {string} line
 * @param {string} fallbackNow
 * @returns {object|null}
 */
export function parseLine(line, fallbackNow) {
  if (!line || !line.trim()) return null;
  let raw;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const legacy = raw.v === 2 && typeof raw.kind === 'string' ? null : fromLegacy(raw);
  const src = legacy ?? raw;
  try {
    return normalizeEvent(src, { now: src.at ?? fallbackNow });
  } catch {
    return null;
  }
}

/**
 * 读某一个月的事件文件（不看快照、不跳过）。
 * @param {string} month YYYY-MM
 * @returns {{events:object[], bad:number, lines:number, file:string|null}}
 */
export function readMonth(month) {
  const file = path.join(rootDir(), `events-${month}.jsonl`);
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { events: [], bad: 0, lines: 0, file: null };
  }
  const events = [];
  let bad = 0;
  let lines = 0;
  const now = new Date().toISOString();
  for (const line of text.split('\n')) {
    if (!line) continue;
    lines += 1;
    const ev = parseLine(line, now);
    if (ev) events.push(ev);
    else bad += 1;
  }
  return { events, bad, lines, file };
}

/**
 * 读全部事件（时间升序），并把快照纳入进来。
 *
 * 有快照时：**月份 ≤ 最新快照月份的事件文件整月跳过**——那些事件已经在快照里数过一遍，
 * 再读一遍就是双计（"快照写完、原文件还没归档"的中间态也会走到这里）。
 * 没快照时：行为与归档功能上线前完全一致。
 *
 * `rev` 是**逻辑事件数**（最新快照的 rev + 尾部条数），跟投影的 meta.rev 同一个口径；
 * `events.length` 只是尾部条数，别拿它当 rev（host/service.js 目前这么用，见 T-0022）。
 * @returns {{events:object[], bad:number, files:number, lines:number, rev:number, total:number,
 *   base:string|null, bases:object[], snapshots:number, badSnapshots:number, skippedFiles:number}}
 */
export function readAll() {
  const files = listFiles();
  const raw = listSnapshots();
  const loaded = raw.map((s) => ({ month: s.month, snap: readSnapshot(s.file) }));
  const bases = loaded
    .filter((s) => s.snap)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((s) => s.snap);
  const base = bases.length ? bases[bases.length - 1] : null;
  const boundary = base ? base.month : '';

  const events = [];
  let bad = 0;
  let lines = 0;
  let skippedFiles = 0;

  for (const file of files) {
    const month = monthOfFile(path.basename(file));
    if (boundary && month && month <= boundary) {
      skippedFiles += 1;
      continue;
    }
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      bad += 1;
      continue;
    }
    const now = new Date().toISOString();
    for (const line of text.split('\n')) {
      if (!line) continue;
      lines += 1;
      const ev = parseLine(line, now);
      if (ev) events.push(ev);
      else bad += 1;
    }
  }

  const baseBad = base ? Number(base.badLines ?? 0) : 0;
  const baseEvents = base ? Number(base.events) : 0;
  return {
    events,
    bad: baseBad + bad,
    files: files.length,
    lines,
    rev: (base ? Number(base.rev) : 0) + events.length,
    total: baseEvents + events.length,
    base: base ? base.month : null,
    bases,
    snapshots: bases.length,
    badSnapshots: loaded.length - bases.length,
    skippedFiles,
  };
}

/**
 * 粗略统计（给状态页用，不解析全部内容）。
 * @returns {{files:number, bytes:number, snapshots:number, snapshotBytes:number,
 *   archives:number, archiveBytes:number, archiveRawBytes:number}}
 */
export function size() {
  let bytes = 0;
  const files = listFiles();
  for (const f of files) {
    try {
      bytes += fs.statSync(f).size;
    } catch { /* 文件消失就忽略 */ }
  }
  let snapshotBytes = 0;
  const snaps = listSnapshots();
  for (const s of snaps) {
    try {
      snapshotBytes += fs.statSync(s.file).size;
    } catch { /* 忽略 */ }
  }
  let archiveBytes = 0;
  const archives = listArchives();
  for (const a of archives) {
    try {
      archiveBytes += fs.statSync(a.file).size;
    } catch { /* 忽略 */ }
  }
  return {
    files: files.length,
    bytes,
    snapshots: snaps.length,
    snapshotBytes,
    archives: archives.length,
    archiveBytes,
  };
}
