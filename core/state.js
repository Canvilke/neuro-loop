/**
 * core/state.js —— 投影（state 树）。
 *
 * 职责：维护"事件 → 计数"的折叠，以及在读取时计算派生量。
 * 不负责：校验事件（events.js）、落盘（storage/*）、调度文案（metrics.js）。
 * 依赖：core/metrics.js、core/contract.js
 *
 * 设计要点：
 *   - 所有字段都是累计计数或最后一次时间，**不存"掌握度"**。
 *   - applyEvent 原地修改传入对象；需要不可变时先结构化克隆。
 *   - rebuild(events) 必须与"在线增量折叠"结果逐字段一致（有测试守着）。
 */

import { SCHEMA_VERSION, SUBJECTS } from './contract.js';
import {
  accuracy, cacheState, classify, dueAt, hitRate, intervalDays, isFalsePositive, isOk,
} from './metrics.js';

/** 备注最多保留多少条，防止 state.json 无限膨胀。 */
const NOTE_CAP = 500;

/**
 * 空投影。
 * @returns {object}
 */
export function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    rev: 0,
    events: 0,
    badLines: 0,
    updatedAt: null,
    concepts: {},
    methods: {},
    problems: {},
    daily: {},
    flattened: {},
    notes: [],
  };
}

/**
 * 取（或建）某考点的计数桶。
 * @param {object} state
 * @param {string} id
 */
function bucket(state, id) {
  if (!state.concepts[id]) {
    state.concepts[id] = {
      id, attempts: 0, hits: 0, misses: 0, recon: 0,
      solveOk: 0, solveFail: 0, fp: 0, streak: 0,
      durationMs: 0, lastAt: null, dueAt: null, methods: {},
    };
  }
  return state.concepts[id];
}

/**
 * 应用一条**已规范化**事件。就地修改 state。
 * @param {object} state
 * @param {object} ev
 * @returns {object} 同一个 state
 */
export function applyEvent(state, ev) {
  state.rev += 1;
  state.events += 1;
  state.updatedAt = ev.at ?? state.updatedAt;

  switch (ev.kind) {
    case 'attempt': {
      const c = bucket(state, ev.concept);
      c.attempts += 1;
      if (ev.recall === 'hit') c.hits += 1;
      else if (ev.recall === 'miss') c.misses += 1;
      else c.recon += 1;

      if (ev.solve === 'ok') c.solveOk += 1;
      else if (ev.solve === 'fail') c.solveFail += 1;
      if (ev.recall === 'hit' && ev.solve === 'fail') c.fp += 1;

      const ok = isOk(ev);
      c.streak = ok ? c.streak + 1 : 0;
      c.lastAt = ev.at;
      c.dueAt = dueAt(ev.at, intervalDays(c.streak, ok));
      c.durationMs += Number(ev.durationMs ?? 0);

      for (const m of ev.methods ?? []) {
        if (!state.methods[m]) {
          state.methods[m] = { id: m, uses: 0, ok: 0, fail: 0, lastAt: null, verified: false, source: 'ai' };
        }
        const mb = state.methods[m];
        mb.uses += 1;
        if (ok) mb.ok += 1; else mb.fail += 1;
        mb.lastAt = ev.at;
        c.methods[m] = (c.methods[m] ?? 0) + 1;
      }
      break;
    }

    case 'daily': {
      if (!state.daily[ev.date]) state.daily[ev.date] = {};
      state.daily[ev.date][ev.subject] = {
        minutes: ev.minutes,
        wrong: ev.wrong,
        blocked: ev.blocked === true,
        note: ev.note ?? '',
        at: ev.at,
      };
      break;
    }

    case 'flatten':
      state.flattened[ev.shard] = true;
      break;

    case 'unflatten':
      delete state.flattened[ev.shard];
      break;

    case 'note': {
      state.notes.push({ at: ev.at, text: ev.text, subject: ev.subject ?? null, ref: ev.ref ?? null });
      if (state.notes.length > NOTE_CAP) state.notes.splice(0, state.notes.length - NOTE_CAP);
      break;
    }

    case 'problem.new': {
      state.problems[ev.id] = {
        id: ev.id, subject: ev.subject, concepts: ev.concepts, methods: ev.methods,
        difficulty: ev.difficulty, source: ev.source ?? '', text: ev.text ?? '',
        answer: ev.answer ?? '', status: 'open', at: ev.at,
      };
      break;
    }

    case 'problem.edit': {
      const p = state.problems[ev.id];
      if (p) Object.assign(p, ev.patch, { editedAt: ev.at });
      break;
    }

    case 'method.new': {
      state.methods[ev.id] = {
        id: ev.id, claim: ev.claim, judge: ev.judge, steps: ev.steps,
        instances: ev.instances, traps: ev.traps, points: ev.points,
        source: ev.source, verified: ev.verified === true,
        confidence: ev.confidence, uses: 0, ok: 0, fail: 0,
        lastAt: null, at: ev.at,
      };
      break;
    }

    case 'method.edit': {
      const m = state.methods[ev.id];
      if (m) Object.assign(m, ev.patch, { editedAt: ev.at });
      break;
    }

    default:
      // 规范化阶段已拦截；这里静默忽略未知类型，保证重建不会因一条新事件全线失败。
      break;
  }
  return state;
}

/**
 * 从零重建。事件必须是已规范化的（迁移在前一步做）。
 * @param {object[]} events
 * @returns {object}
 */
export function rebuild(events) {
  const state = emptyState();
  for (const ev of events) applyEvent(state, ev);
  return state;
}

/**
 * 单考点摘要（给 UI / 路由用）。派生量都在这里算，别处不要再算一遍。
 * @param {object} c 计数桶
 * @param {number} nowMs
 */
export function conceptSummary(c, nowMs) {
  return {
    id: c.id,
    attempts: c.attempts,
    hits: c.hits,
    misses: c.misses,
    recon: c.recon,
    hitRate: hitRate(c),
    accuracy: accuracy(c),
    falsePositive: isFalsePositive(c),
    fp: c.fp,
    streak: c.streak,
    lastAt: c.lastAt,
    dueAt: c.dueAt,
    dueTextDays: c.dueAt ? dueAt(c.lastAt, 0) : null,
    cache: cacheState(c, nowMs),
    classify: classify(c),
    minutes: Math.round((c.durationMs ?? 0) / 60000),
    methods: Object.keys(c.methods ?? {}),
  };
}

/**
 * 到期清单：按到期时间升序，只取已到期的。
 * @param {object} state
 * @param {number} nowMs
 * @param {number} [limit]
 */
export function dueList(state, nowMs, limit = 5) {
  const rows = Object.values(state.concepts)
    .filter((c) => c.dueAt && new Date(c.dueAt).getTime() <= nowMs)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .slice(0, limit);
  return rows.map((c) => conceptSummary(c, nowMs));
}

/**
 * 按学科聚合（学科从考点 id 前缀取：`math-deriv` → `math`）。
 * 不是每个 id 都带学科前缀，所以未知前缀归到 `other`。
 * @param {object} state
 * @param {number} nowMs
 */
export function subjectStats(state, nowMs) {
  const out = {};
  for (const s of SUBJECTS) out[s] = { attempts: 0, hits: 0, misses: 0, fp: 0, due: 0, concepts: 0 };
  out.other = { attempts: 0, hits: 0, misses: 0, fp: 0, due: 0, concepts: 0 };

  for (const c of Object.values(state.concepts)) {
    const prefix = String(c.id).split('-')[0];
    const row = out[prefix] ?? out.other;
    row.concepts += 1;
    row.attempts += c.attempts;
    row.hits += c.hits;
    row.misses += c.misses;
    row.fp += c.fp;
    if (c.dueAt && new Date(c.dueAt).getTime() <= nowMs) row.due += 1;
  }
  return out;
}
