/**
 * core/compact.js —— 把事件流按月折叠成快照（纯函数）。
 *
 * 职责：算"某月及之前的全部事件"折成什么状态；把快照折回 state；证明"快照 + 尾部事件"与"全量重放"一致。
 * 不负责：文件读写（storage/events.js）、命令行（tools/compact.mjs）、投影（storage/projection.js）。
 * 依赖：core/state.js、core/contract.js
 *
 * 设计要点：
 *   - 快照是**累计前缀态**，不是月内增量。10 月快照 = 10 月及之前全部事件的折叠结果。
 *     这样 streak / dueAt 这类"上一条影响下一条"的量天然连续，合并不需要任何拼接逻辑。
 *   - 合并规则只有一条：后一个快照**整体替换**前一个，再往后追加尾部事件。不合并、不 diff。
 *   - 快照必须能由事件流完全重建，所以它只存 state 的字段 + 三个溯源量（month / rev / firstAt-lastAt）；
 *     比较两条快照是否等价时用 equalState 的稳定序列化，忽略 createdAt。
 */

import { DomainError, SCHEMA_VERSION, check } from './contract.js';
import { applyEvent, emptyState, rebuild } from './state.js';

/** 快照格式版本。与事件版本（EVENT_VERSION）无关，独立演进。 */
export const SNAPSHOT_VERSION = 1;

/** 月份形状：YYYY-MM。 */
const MONTH_RE = /^(\d{4})-(\d{2})$/;

/** 快照文件名：snapshot-YYYY-MM.json。 */
const SNAPSHOT_FILE_RE = /^snapshot-(\d{4})-(\d{2})\.json$/;

/** 事件文件名：events-YYYY-MM.jsonl（与 storage/events.js 的 FILE_RE 同形）。 */
const EVENT_FILE_RE = /^events-(\d{4})-(\d{2})\.jsonl$/;

/** state 里可折叠的字段（schema 版本这些元信息单独处理）。 */
const BODY_KEYS = ['concepts', 'methods', 'problems', 'daily', 'flattened', 'notes'];

/**
 * 是否是合法月份串（YYYY-MM，且月份在 1–12）。
 * @param {unknown} month
 * @returns {boolean}
 */
export function isMonth(month) {
  if (typeof month !== 'string') return false;
  const m = MONTH_RE.exec(month);
  if (!m) return false;
  const mm = Number(m[2]);
  return mm >= 1 && mm <= 12;
}

/**
 * 月份 → 快照文件名。
 * @param {string} month
 * @returns {string}
 */
export function snapshotFileName(month) {
  check(isMonth(month), 'bad-snapshot-month', `月份形状不对：${month}`);
  return `snapshot-${month}.json`;
}

/**
 * 从文件名反推月份（事件文件与快照文件都认）；认不出返回 null。
 * @param {string} name
 * @returns {string|null}
 */
export function monthOfFile(name) {
  if (typeof name !== 'string') return null;
  const m = SNAPSHOT_FILE_RE.exec(name) ?? EVENT_FILE_RE.exec(name);
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * 时间点所属月份（**本地时区**，必须与 storage/events.js 的 monthFile 使用同一把尺子）。
 * @param {string|Date} at
 * @returns {string}
 */
export function monthOfAt(at) {
  const d = at instanceof Date ? at : new Date(at);
  check(!Number.isNaN(d.getTime()), 'bad-time', `时间无法解析：${at}`);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * 取 state 里可折叠的那部分（深拷贝，避免快照与运行态共享引用）。
 * @param {object} state
 * @returns {object}
 */
function stateBody(state) {
  const out = {};
  for (const k of BODY_KEYS) out[k] = structuredClone(state[k]);
  return out;
}

/**
 * 由**已经累计折好的 state** 生成某月快照。
 * CLI 按月顺序推进时用这个：state 里已经含着前面所有月份的结果。
 * @param {string} month
 * @param {object} state 累计前缀态
 * @param {{firstAt?:string|null, lastAt?:string|null, badLines?:number, createdAt?:string}} [opts]
 * @returns {object}
 */
export function snapshotFromState(month, state, opts = {}) {
  check(isMonth(month), 'bad-snapshot-month', `月份形状不对：${month}`);
  return {
    v: SNAPSHOT_VERSION,
    month,
    schemaVersion: Number(state.schemaVersion ?? SCHEMA_VERSION),
    rev: state.rev,
    events: state.events,
    badLines: Number(opts.badLines ?? state.badLines ?? 0),
    firstAt: opts.firstAt ?? null,
    lastAt: opts.lastAt ?? state.updatedAt ?? null,
    createdAt: opts.createdAt ?? new Date().toISOString(),
    ...stateBody(state),
  };
}

/**
 * 把"某月的事件"折成该月快照（从零开始，只含这一月）。
 * 事件必须全部落在该月，否则抛 `bad-snapshot-month`——静默混月会让 rev 与文件对不上。
 * @param {string} month
 * @param {object[]} events 已规范化事件
 * @param {{badLines?:number, createdAt?:string}} [opts]
 * @returns {object}
 */
export function snapshotOf(month, events, opts = {}) {
  check(isMonth(month), 'bad-snapshot-month', `月份形状不对：${month}`);
  let firstAt = null;
  let lastAt = null;
  for (const ev of events ?? []) {
    const m = monthOfAt(ev.at);
    if (m !== month) {
      throw new DomainError('bad-snapshot-month', `事件 ${ev.at} 属于 ${m}，不属于 ${month}`);
    }
    if (!firstAt || String(ev.at) < firstAt) firstAt = ev.at;
    if (!lastAt || String(ev.at) >= lastAt) lastAt = ev.at;
  }
  const state = rebuild(events ?? []);
  return snapshotFromState(month, state, {
    firstAt,
    lastAt,
    badLines: opts.badLines ?? 0,
    createdAt: opts.createdAt,
  });
}

/**
 * 快照形状校验（读盘后先过这一关，坏了就当没有快照，别拿去折叠）。
 * @param {unknown} x
 * @returns {boolean}
 */
export function isSnapshot(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  if (x.v !== SNAPSHOT_VERSION) return false;
  if (!isMonth(x.month)) return false;
  if (!Number.isInteger(x.schemaVersion) || x.schemaVersion < 1) return false;
  if (!Number.isInteger(x.rev) || x.rev < 0) return false;
  if (!Number.isInteger(x.events) || x.events < 0) return false;
  if (x.badLines != null && (!Number.isInteger(x.badLines) || x.badLines < 0)) return false;
  for (const k of ['concepts', 'methods', 'problems', 'daily', 'flattened']) {
    const v = x[k];
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  }
  return Array.isArray(x.notes);
}

/**
 * 快照 → 可继续 applyEvent 的 state（深拷贝，不改快照本体）。
 * @param {object} snap
 * @returns {object}
 */
export function baseState(snap) {
  check(isSnapshot(snap), 'bad-snapshot', `快照形状不对：${snap?.month ?? '(无)'}`);
  const state = emptyState();
  state.schemaVersion = snap.schemaVersion;
  state.rev = snap.rev;
  state.events = snap.events;
  state.badLines = snap.badLines ?? 0;
  state.updatedAt = snap.lastAt ?? null;
  for (const k of BODY_KEYS) state[k] = structuredClone(snap[k]);
  return state;
}

/**
 * 快照 + 尾部事件 → state。与"全量重放"必须逐字节一致（有测试守着）。
 *
 * 只认**月份最新**的那个快照；更早的会被最新快照整体替换。
 * 尾部的 events 若落在快照覆盖的月份之内，直接跳过——那是"快照写完、原文件还没归档"的中间态，
 * 数一遍就够，绝不能数两遍。
 * @param {object[]} bases 快照数组（顺序任意）
 * @param {object[]} events 尾部事件（顺序任意，但必须是已规范化的）
 * @returns {object}
 */
export function rebuildFromBase(bases, events) {
  const valid = (bases ?? []).filter(isSnapshot).sort((a, b) => a.month.localeCompare(b.month));
  const base = valid.length ? valid[valid.length - 1] : null;
  const state = base ? baseState(base) : emptyState();
  const boundary = base ? base.month : '';
  for (const ev of events ?? []) {
    if (boundary && monthOfAt(ev.at) <= boundary) continue;
    applyEvent(state, ev);
  }
  return state;
}

/**
 * 稳定序列化：递归按 key 排序。用来比较"两个 state 是否等价"，不受键插入顺序影响。
 * @param {unknown} v
 * @returns {unknown}
 */
function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = stable(v[k]);
    return out;
  }
  return v;
}

/**
 * 稳定序列化后的字符串（比较用；也是"逐字节一致"的判据）。
 * @param {unknown} v
 * @returns {string}
 */
export function canonical(v) {
  return JSON.stringify(stable(v));
}

/**
 * 两个 state（或快照的 state 部分）是否等价。
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function equalState(a, b) {
  return canonical(a) === canonical(b);
}
