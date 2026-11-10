/**
 * storage/events.js —— L1 真源（append-only jsonl）的读写。
 *
 * 职责：定位目录、追加事件、按月读取、坏行计数。
 * 不负责：校验（core/events.js）、投影（storage/projection.js）。
 * 依赖：core/events.js、storage/legacy.js
 *
 * 布局：%USERPROFILE%\.dsh\neuro-loop\events-YYYY-MM.jsonl
 * 测试用 NEUROLOOP_HOME 覆盖根目录（每次调用都读环境变量，不在 import 时固化）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { normalizeEvent, toLine } from '../core/events.js';
import { fromLegacy } from './legacy.js';

const FILE_RE = /^events-(\d{4})-(\d{2})\.jsonl$/;

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
 * 读全部事件（时间升序）。
 * @returns {{events:object[], bad:number, files:number, lines:number}}
 */
export function readAll() {
  const files = listFiles();
  const events = [];
  let bad = 0;
  let lines = 0;

  for (const file of files) {
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
  return { events, bad, files: files.length, lines };
}

/**
 * 粗略统计（给状态页用，不解析全部内容）。
 * @returns {{files:number, bytes:number}}
 */
export function size() {
  let bytes = 0;
  const files = listFiles();
  for (const f of files) {
    try {
      bytes += fs.statSync(f).size;
    } catch { /* 文件消失就忽略 */ }
  }
  return { files: files.length, bytes };
}
