/**
 * host/service.js —— 宿主侧的状态服务（ADR-0001 的 storage→host 边界）。
 *
 * 职责：打开投影库、保证投影与 L1 同步、把投影读成客户端认识的视图、原子写 state.json。
 * 不负责：HTTP（index.js）、校验错误码（host/event.js 保留 v1 的码表给客户端）。
 * 依赖：core/*、storage/*
 *
 * 为什么 state.json 还留着：它是人眼可读的备份，坏了可以从 L1 重建；
 * 但它不是接口——接口永远是 /neuroloop/state。
 */

import fs from 'node:fs';
import path from 'node:path';

import { normalizeEvent as normalizeV2 } from '../core/events.js';
import { hitRate } from '../core/metrics.js';
import { fromLegacy } from '../storage/legacy.js';
import { readAll, append as appendLine, rootDir, ensureRoot, size } from '../storage/events.js';
import { openDb, getMeta, setMeta, rebuild, applyIncremental } from '../storage/projection.js';

const VIEW_VERSION = 2;

/** 上一次打开的库（一个进程一个 profile 目录，够用）。 */
let DB = null;
let DB_FILE = null;

/**
 * 打开（必要时重建）投影库。
 * @returns {import('node:sqlite').DatabaseSync}
 */
export function db() {
  const file = path.join(ensureRoot(), 'projection.db');
  if (DB && DB_FILE === file) return DB;
  if (DB) {
    try { DB.close(); } catch { /* 已关就忽略 */ }
  }
  const read = readAll();
  const fresh = openDb(file);
  const rev = getMeta(fresh, 'rev');
  if (rev === null || Number(rev) !== read.events.length) {
    rebuild(fresh, read.events);
    // 重建时顺手把人眼可读的投影写回磁盘，免得 state.json 长期缺失。
    saveState(view(fresh));
  } else {
    setMeta(fresh, 'badLines', String(read.bad));
  }
  DB = fresh;
  DB_FILE = file;
  return DB;
}

/** 测试用：丢掉内存里的库句柄，下次重新打开。 */
export function reset() {
  if (DB) {
    try { DB.close(); } catch { /* ignore */ }
  }
  DB = null;
  DB_FILE = null;
}

/**
 * 投影读成视图（客户端只认这个形状）。
 * @param {import('node:sqlite').DatabaseSync} conn
 * @returns {object}
 */
export function view(conn) {
  const nodes = {};
  for (const row of conn.prepare('SELECT * FROM concepts ORDER BY id').all()) {
    nodes[row.id] = {
      attempts: row.attempts,
      hits: row.hits,
      misses: row.misses,
      recon: row.recon,
      solveOk: row.solve_ok,
      solveFail: row.solve_fail,
      fp: row.fp,
      streak: row.streak,
      durationMs: row.duration_ms,
      lastAt: row.last_at,
      dueAt: row.due_at,
      hitRate: hitRate({ hits: row.hits, misses: row.misses }),
    };
  }

  const flat = conn.prepare('SELECT shard FROM flattened ORDER BY at').all().map((r) => r.shard);

  const daily = {};
  for (const row of conn.prepare('SELECT * FROM daily ORDER BY date').all()) {
    if (!daily[row.date]) daily[row.date] = {};
    daily[row.date][row.subject] = {
      minutes: row.minutes,
      wrong: safeJson(row.wrong_json, []),
      blocked: row.blocked ?? '',
      note: row.note ?? '',
      at: row.at,
    };
  }

  const methods = {};
  for (const row of conn.prepare('SELECT * FROM methods ORDER BY id').all()) {
    methods[row.id] = {
      claim: row.claim ?? '',
      judge: row.judge ?? '',
      source: row.source ?? 'ai',
      verified: !!row.verified,
      uses: row.uses,
      ok: row.ok,
      fail: row.fail,
      lastAt: row.last_at,
      points: safeJson(row.points_json, []),
    };
  }

  const events = Number(getMeta(conn, 'rev') ?? 0);
  return {
    version: VIEW_VERSION,
    rev: events,
    events,
    badLines: Number(getMeta(conn, 'badLines') ?? 0),
    updatedAt: getMeta(conn, 'updatedAt') || null,
    nodes,
    flattened: flat,
    daily,
    methods,
    storage: size(),
  };
}

/** JSON 解析失败时回退默认值（历史行可能被手改）。 */
function safeJson(text, fallback) {
  try {
    const v = JSON.parse(text ?? '');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * 读当前视图。
 * @returns {object}
 */
export function getState() {
  const s = view(db());
  // state.json 是给人看的备份：丢了就顺手补一份，不让它在磁盘上长期缺失。
  if (!fs.existsSync(path.join(rootDir(), 'state.json'))) saveState(s);
  return s;
}

/**
 * 追加一条**已通过 v1 校验**的事件：L1 落盘 → 投影增量 → 写 state.json。
 * @param {object} normV1 host/event.js 出来的紧凑事件
 * @returns {{state:object, event:object}}
 */
export function addEvent(normV1) {
  const raw = fromLegacy(normV1);
  if (!raw) throw Object.assign(new Error('unmappable-event'), { code: 'bad-kind' });
  const ev = normalizeV2(raw, { now: normV1.t });

  appendLine(ev);

  const conn = db();
  applyIncremental(conn, ev);
  setMeta(conn, 'rev', String(Number(getMeta(conn, 'rev') ?? 0) + 1));
  setMeta(conn, 'updatedAt', ev.at);

  const state = view(conn);
  saveState(state);
  return { state, event: ev };
}

/**
 * 原子写 state.json（临时文件 + rename）。
 * @param {object} state
 */
export function saveState(state) {
  const file = path.join(rootDir(), 'state.json');
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * 数据目录（给文档/工具用）。
 * @returns {string}
 */
export function dataDir() {
  return rootDir();
}
