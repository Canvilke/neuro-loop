/**
 * storage/projection.js —— SQLite 投影（可丢弃、可重建）。
 *
 * 职责：把事件折叠进索引表，提供到期/计数查询。
 * 不负责：校验事件、格式化给 UI（在 core/state.js 的摘要函数里）。
 * 依赖：node:sqlite（内置）、core/metrics.js、core/state.js 的 attemptDelta
 *
 * 不变量：**增量写入的结果必须与全量重建逐行一致**（test/storage.test.mjs 守着）。
 * 所有增量公式来自 core/state.js 的 attemptDelta，避免"JS 一套、SQL 一套"。
 */

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { SCHEMA_VERSION } from '../core/contract.js';
import { dueAt, intervalDays } from '../core/metrics.js';
import { attemptDelta } from '../core/state.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS concepts(
  id TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0,
  hits INTEGER NOT NULL DEFAULT 0, misses INTEGER NOT NULL DEFAULT 0,
  recon INTEGER NOT NULL DEFAULT 0, solve_ok INTEGER NOT NULL DEFAULT 0,
  solve_fail INTEGER NOT NULL DEFAULT 0, fp INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0,
  last_at TEXT, due_at TEXT
);
CREATE TABLE IF NOT EXISTS methods(
  id TEXT PRIMARY KEY, claim TEXT, judge TEXT, source TEXT,
  verified INTEGER NOT NULL DEFAULT 0, uses INTEGER NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL DEFAULT 0, fail INTEGER NOT NULL DEFAULT 0,
  last_at TEXT, points_json TEXT, traps_json TEXT
);
CREATE TABLE IF NOT EXISTS daily(
  date TEXT NOT NULL, subject TEXT NOT NULL, minutes INTEGER NOT NULL DEFAULT 0,
  wrong_json TEXT, blocked TEXT NOT NULL DEFAULT '', note TEXT, at TEXT,
  PRIMARY KEY(date, subject)
);
CREATE TABLE IF NOT EXISTS flattened(shard TEXT PRIMARY KEY, at TEXT);
CREATE TABLE IF NOT EXISTS problems(
  id TEXT PRIMARY KEY, subject TEXT, status TEXT, difficulty INTEGER,
  concepts_json TEXT, methods_json TEXT, text TEXT, at TEXT
);
CREATE TABLE IF NOT EXISTS notes(
  seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, text TEXT, subject TEXT, ref TEXT
);
CREATE INDEX IF NOT EXISTS idx_concepts_due ON concepts(due_at);
CREATE INDEX IF NOT EXISTS idx_daily_date ON daily(date);
`;

/** 重建时清空的表（顺序无关，全部删）。 */
const TABLES = ['concepts', 'methods', 'daily', 'flattened', 'problems', 'notes'];

/**
 * 打开（必要时创建）投影库。
 * @param {string} file 绝对路径；传 `:memory:` 可用于测试
 * @returns {DatabaseSync}
 */
export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);
  setMeta(db, 'schemaVersion', String(SCHEMA_VERSION));
  return db;
}

/**
 * 读 meta。
 * @param {DatabaseSync} db
 * @param {string} key
 * @returns {string|null}
 */
export function getMeta(db, key) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? String(row.value) : null;
}

/**
 * 写 meta。
 * @param {DatabaseSync} db
 * @param {string} key
 * @param {string} value
 */
export function setMeta(db, key, value) {
  db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

/**
 * 应用一条**已规范化**事件（增量）。
 * @param {DatabaseSync} db
 * @param {object} ev
 */
export function applyIncremental(db, ev) {
  switch (ev.kind) {
    case 'attempt': {
      const row = db.prepare('SELECT * FROM concepts WHERE id = ?').get(ev.concept);
      const d = attemptDelta(ev);
      const streak = d.ok ? (row?.streak ?? 0) + 1 : 0;
      const nextDue = dueAt(ev.at, intervalDays(streak, d.ok));
      if (row) {
        db.prepare(`UPDATE concepts SET attempts = attempts + 1,
          hits = hits + ?, misses = misses + ?, recon = recon + ?,
          solve_ok = solve_ok + ?, solve_fail = solve_fail + ?, fp = fp + ?,
          streak = ?, duration_ms = duration_ms + ?, last_at = ?, due_at = ?
          WHERE id = ?`).run(
          d.hits, d.misses, d.recon, d.solveOk, d.solveFail, d.fp,
          streak, Number(ev.durationMs ?? 0), ev.at, nextDue, ev.concept,
        );
      } else {
        db.prepare(`INSERT INTO concepts
          (id, attempts, hits, misses, recon, solve_ok, solve_fail, fp, streak, duration_ms, last_at, due_at)
          VALUES(?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          ev.concept, d.hits, d.misses, d.recon, d.solveOk, d.solveFail, d.fp,
          streak, Number(ev.durationMs ?? 0), ev.at, nextDue,
        );
      }
      for (const m of ev.methods ?? []) {
        const mrow = db.prepare('SELECT id FROM methods WHERE id = ?').get(m);
        if (mrow) {
          db.prepare('UPDATE methods SET uses = uses + 1, ok = ok + ?, fail = fail + ?, last_at = ? WHERE id = ?')
            .run(d.ok ? 1 : 0, d.ok ? 0 : 1, ev.at, m);
        } else {
          db.prepare('INSERT INTO methods(id, uses, ok, fail, last_at, source) VALUES(?, 1, ?, ?, ?, ?)')
            .run(m, d.ok ? 1 : 0, d.ok ? 0 : 1, ev.at, 'ai');
        }
      }
      break;
    }

    case 'daily': {
      db.prepare(`INSERT INTO daily(date, subject, minutes, wrong_json, blocked, note, at)
        VALUES(?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date, subject) DO UPDATE SET minutes = excluded.minutes,
          wrong_json = excluded.wrong_json, blocked = excluded.blocked,
          note = excluded.note, at = excluded.at`).run(
        ev.date, ev.subject, ev.minutes, JSON.stringify(ev.wrong ?? []),
        ev.blocked ?? '', ev.note ?? '', ev.at,
      );
      break;
    }

    case 'flatten':
      db.prepare('INSERT INTO flattened(shard, at) VALUES(?, ?) ON CONFLICT(shard) DO UPDATE SET at = excluded.at')
        .run(ev.shard, ev.at);
      break;

    case 'unflatten':
      db.prepare('DELETE FROM flattened WHERE shard = ?').run(ev.shard);
      break;

    case 'note':
      db.prepare('INSERT INTO notes(at, text, subject, ref) VALUES(?, ?, ?, ?)')
        .run(ev.at, ev.text, ev.subject ?? null, ev.ref ?? null);
      break;

    case 'problem.new':
      db.prepare(`INSERT INTO problems(id, subject, status, difficulty, concepts_json, methods_json, text, at)
        VALUES(?, ?, 'open', ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET subject = excluded.subject, difficulty = excluded.difficulty,
          concepts_json = excluded.concepts_json, methods_json = excluded.methods_json,
          text = excluded.text`).run(
        ev.id, ev.subject, ev.difficulty,
        JSON.stringify(ev.concepts ?? []), JSON.stringify(ev.methods ?? []), ev.text ?? '', ev.at,
      );
      break;

    case 'problem.edit': {
      if (ev.patch.status) {
        db.prepare('UPDATE problems SET status = ? WHERE id = ?').run(ev.patch.status, ev.id);
      }
      if (ev.patch.text !== undefined) {
        db.prepare('UPDATE problems SET text = ? WHERE id = ?').run(ev.patch.text, ev.id);
      }
      break;
    }

    case 'method.new':
      db.prepare(`INSERT INTO methods(id, claim, judge, source, verified, points_json, traps_json, uses, ok, fail)
        VALUES(?, ?, ?, ?, ?, ?, ?, 0, 0, 0)
        ON CONFLICT(id) DO UPDATE SET claim = excluded.claim, judge = excluded.judge,
          source = excluded.source, verified = excluded.verified,
          points_json = excluded.points_json, traps_json = excluded.traps_json`).run(
        ev.id, ev.claim, ev.judge, ev.source ?? 'ai', ev.verified ? 1 : 0,
        JSON.stringify(ev.points ?? []), JSON.stringify(ev.traps ?? []),
      );
      break;

    case 'method.edit': {
      if (ev.patch.claim !== undefined) {
        db.prepare('UPDATE methods SET claim = ? WHERE id = ?').run(ev.patch.claim, ev.id);
      }
      if (ev.patch.judge !== undefined) {
        db.prepare('UPDATE methods SET judge = ? WHERE id = ?').run(ev.patch.judge, ev.id);
      }
      if (ev.patch.verified !== undefined) {
        db.prepare('UPDATE methods SET verified = ? WHERE id = ?').run(ev.patch.verified ? 1 : 0, ev.id);
      }
      break;
    }

    default:
      break;
  }
}

/**
 * 全量重建：清表 → 顺序重放 → 写 meta。
 * @param {DatabaseSync} db
 * @param {object[]} events
 * @returns {{events:number, ms:number}}
 */
export function rebuild(db, events) {
  const t0 = performance.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const table of TABLES) db.exec(`DELETE FROM ${table}`);
    for (const ev of events) applyIncremental(db, ev);
    setMeta(db, 'rev', String(events.length));
    setMeta(db, 'updatedAt', events.length ? events[events.length - 1].at : '');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { events: events.length, ms: Math.round(performance.now() - t0) };
}

/**
 * 已到期的考点（按到期时间升序）。
 * @param {DatabaseSync} db
 * @param {number} nowMs
 * @param {number} [limit]
 * @returns {object[]}
 */
export function dueList(db, nowMs, limit = 5) {
  return db.prepare(`SELECT * FROM concepts WHERE due_at IS NOT NULL AND due_at <= ?
    ORDER BY due_at ASC LIMIT ?`).all(new Date(nowMs).toISOString(), limit);
}

/**
 * 无参数时读全部表，供"投影 vs core 一致性"测试使用。
 * @param {DatabaseSync} db
 * @returns {object}
 */
export function dump(db) {
  const rows = (t) => db.prepare(`SELECT * FROM ${t}`).all();
  return {
    concepts: rows('concepts'),
    methods: rows('methods'),
    daily: rows('daily'),
    flattened: rows('flattened'),
    problems: rows('problems'),
    notes: rows('notes'),
  };
}
