/**
 * host/team.js —— 维护票单台账（ADR-0002）。
 *
 * 职责：追加票单事件、重放出看板、判断卡住。
 * 不负责：跑活（worker 由调度/子代理承担）、改代码。
 * 依赖：node:fs / node:path（零第三方）
 *
 * 为什么 append-only：和 L1 事件流同一套纪律——不抹掉历史，撤销靠追加。
 * 状态缓存 `team/board.json` 可随时删；删了从 tickets.jsonl 重放。
 */

import fs from 'node:fs';
import path from 'node:path';

const ROLES = ['architect', 'core-dev', 'host-dev', 'ui-dev', 'content', 'qa'];
const EVENTS = ['create', 'claim', 'complete', 'block', 'reopen'];
const STALE_HOURS = 6;

/**
 * 台账目录（跟着仓库走，不跟用户数据走——它属于代码）。
 * @param {string} root 仓库根
 * @returns {string}
 */
export function teamDir(root) {
  return path.join(root, 'team');
}

function ledgerPath(root) {
  return path.join(teamDir(root), 'tickets.jsonl');
}

/**
 * 读角色契约；文件缺失时退回内置最小集，避免控制台整块空白。
 * @param {string} root
 * @returns {{roles:object[]}}
 */
export function roles(root) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(teamDir(root), 'roles.json'), 'utf8'));
    if (Array.isArray(raw.roles) && raw.roles.length) return raw;
  } catch { /* 缺文件就用内置 */ }
  return { version: 0, roles: ROLES.map((id) => ({ id, name: id, owns: [], done: [], never: [] })) };
}

/**
 * 读台账事件。
 * @param {string} root
 * @returns {object[]}
 */
export function readLedger(root) {
  let text = '';
  try {
    text = fs.readFileSync(ledgerPath(root), 'utf8');
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line);
      if (ev && typeof ev.id === 'string' && EVENTS.includes(ev.ev)) out.push(ev);
    } catch { /* 坏行跳过，控制台不该因为一行坏数据打不开 */ }
  }
  return out;
}

/**
 * 追加一条台账事件。
 * @param {string} root
 * @param {object} ev
 */
function append(root, ev) {
  const dir = teamDir(root);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(ledgerPath(root), `${JSON.stringify(ev)}\n`, 'utf8');
}

/**
 * 下一个票号（不复用）。
 * @param {object[]} events
 * @returns {string}
 */
function nextId(events) {
  let max = 0;
  for (const e of events) {
    const m = /^T-(\d+)$/.exec(e.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `T-${String(max + 1).padStart(4, '0')}`;
}

/**
 * 重放出台账看板。
 * @param {string} root
 * @param {{now?:number, staleHours?:number}} [opts]
 * @returns {{tickets:object[], counts:object, stale:object[], roles:object[]}}
 */
export function board(root, opts = {}) {
  const now = opts.now ?? Date.now();
  const staleMs = (opts.staleHours ?? STALE_HOURS) * 3600_000;
  const events = readLedger(root);

  const map = new Map();
  for (const ev of events) {
    let t = map.get(ev.id);
    if (!t && ev.ev !== 'create') {
      // 没有 create 的孤儿事件：忽略，避免显示一张来源不明的票
      continue;
    }
    if (ev.ev === 'create') {
      t = {
        id: ev.id,
        title: ev.title ?? ev.id,
        role: ev.role ?? 'qa',
        scope: ev.scope ?? [],
        deps: ev.deps ?? [],
        accept: ev.accept ?? [],
        note: '',
        status: 'ready',
        by: null,
        createdAt: ev.t,
        updatedAt: ev.t,
      };
      map.set(ev.id, t);
      continue;
    }
    t.updatedAt = ev.t;
    if (ev.ev === 'claim') {
      t.status = 'claimed';
      t.by = ev.by ?? 'unknown';
    } else if (ev.ev === 'complete') {
      t.status = 'done';
      t.note = ev.note ?? '';
      t.by = ev.by ?? t.by;
    } else if (ev.ev === 'block') {
      t.status = 'blocked';
      t.note = ev.note ?? '';
    } else if (ev.ev === 'reopen') {
      t.status = 'ready';
      t.by = null;
      t.note = ev.note ?? '';
    }
  }

  const done = new Set([...map.values()].filter((t) => t.status === 'done').map((t) => t.id));
  const tickets = [...map.values()].map((t) => {
    const blockedBy = (t.deps ?? []).filter((d) => !done.has(d));
    const ageH = (now - Date.parse(t.updatedAt)) / 3600_000;
    return {
      ...t,
      depsOpen: blockedBy,
      claimable: t.status === 'ready' && blockedBy.length === 0,
      ageH: Math.round(ageH * 10) / 10,
      stale: t.status === 'claimed' && ageH > staleMs / 3600_000,
    };
  });

  const counts = {
    total: tickets.length,
    ready: tickets.filter((t) => t.claimable).length,
    claimed: tickets.filter((t) => t.status === 'claimed').length,
    blocked: tickets.filter((t) => t.status === 'blocked').length,
    done: tickets.filter((t) => t.status === 'done').length,
  };
  const stale = tickets.filter((t) => t.stale);

  return { tickets, counts, stale, roles: roles(root).roles };
}

/**
 * 开一票。
 * @param {string} root
 * @param {object} spec {title, role, scope?, deps?, accept?, note?}
 * @returns {object} 新票
 */
export function create(root, spec) {
  if (!spec || typeof spec.title !== 'string' || !spec.title.trim()) {
    throw Object.assign(new Error('title required'), { code: 'bad-title' });
  }
  if (!ROLES.includes(spec.role)) {
    throw Object.assign(new Error('unknown role'), { code: 'bad-role' });
  }
  const events = readLedger(root);
  const id = nextId(events);
  const t = new Date().toISOString();
  append(root, {
    t,
    ev: 'create',
    id,
    title: spec.title.trim().slice(0, 120),
    role: spec.role,
    scope: Array.isArray(spec.scope) ? spec.scope.slice(0, 12) : [],
    deps: Array.isArray(spec.deps) ? spec.deps.filter((d) => /^T-\d{4}$/.test(String(d))) : [],
    accept: Array.isArray(spec.accept) ? spec.accept.slice(0, 8) : [],
  });
  return board(root).tickets.find((x) => x.id === id);
}

/**
 * 领票 / 完票 / 阻塞 / 重开。
 * @param {string} root
 * @param {{id:string, action:'claim'|'complete'|'block'|'reopen', by?:string, note?:string}} req
 * @returns {object} 更新后的票
 */
export function update(root, req) {
  const { id, action } = req ?? {};
  if (!/^T-\d{4}$/.test(String(id))) throw Object.assign(new Error('bad id'), { code: 'bad-id' });
  if (!['claim', 'complete', 'block', 'reopen'].includes(action)) {
    throw Object.assign(new Error('bad action'), { code: 'bad-action' });
  }
  const b = board(root);
  const t = b.tickets.find((x) => x.id === id);
  if (!t) throw Object.assign(new Error('not found'), { code: 'no-ticket' });

  if (action === 'claim' && !t.claimable) {
    throw Object.assign(new Error('not claimable'), {
      code: t.status === 'claimed' ? 'already-claimed' : 'deps-open',
    });
  }
  if (action === 'block' && !String(req.note ?? '').trim()) {
    throw Object.assign(new Error('note required'), { code: 'note-required' });
  }

  append(root, {
    t: new Date().toISOString(),
    ev: action,
    id,
    by: req.by ? String(req.by).slice(0, 40) : undefined,
    note: req.note ? String(req.note).slice(0, 300) : undefined,
  });
  return board(root).tickets.find((x) => x.id === id);
}
