/**
 * core/events.js —— 事件规范化。
 *
 * 职责：把「任何来源的 JSON」变成规范事件，非法输入抛 DomainError。
 * 不负责：落盘、计算投影、决定调度。
 * 依赖：core/contract.js
 *
 * 规范事件只有一条铁律：**只追加、不改写**。所以这里不返回"补丁"，
 * 只返回一条可以原样 append 的完整事件。
 */

import {
  EVENT_VERSION, LIMITS, SUBJECTS, RE_CONCEPT, RE_METHOD, RE_PROBLEM, RE_SHARD,
  DomainError, check, clip, isDate,
} from './contract.js';

/** 字符串字段：去掉首尾空白并校验非空。 */
function str(v, code, max = LIMITS.text) {
  check(typeof v === 'string', code);
  const t = v.trim();
  check(t.length > 0, code);
  check(t.length <= max, `${code}-too-long`);
  return t;
}

/** 字符串数组：去重、保序、限长。 */
function strList(v, code, max, lenMax = 64) {
  check(Array.isArray(v), code);
  const out = [];
  for (const item of v) {
    const t = str(item, code, lenMax);
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** 32 位 FNV-1a，纯函数，用来在没给 id 时派生一个稳定短 id。 */
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * 事件 id：给了就用给的，否则由「时间 + 内容」派生（同一秒同一内容视为同一条）。
 * @param {any} given
 * @param {string} at
 * @param {object} body
 */
function eventId(given, at, body) {
  if (typeof given === 'string' && /^[a-z0-9]{8,20}$/.test(given)) return given;
  const seed = `${at}|${JSON.stringify(body)}`;
  return `${fnv1a(seed)}${fnv1a(seed.split('').reverse().join(''))}`.slice(0, 12);
}

/** 时间：缺省用调用方传的 now，必须是可解析的 ISO。 */
function stamp(v, now) {
  const raw = typeof v === 'string' && v ? v : now;
  const d = new Date(raw);
  check(!Number.isNaN(d.getTime()), 'bad-at');
  return d.toISOString();
}

/**
 * v1 兼容映射：`recall` / `review` → `attempt`。
 * v1 只有对错与命中，没有 solve 与 duration，所以 solve 留 null。
 * @param {any} raw
 */
function fromLegacy(raw) {
  if (raw.kind !== 'recall' && raw.kind !== 'review') return null;
  const ok = raw.ok === true || raw.result === 'ok' || raw.recall === 'hit';
  return {
    kind: 'attempt',
    concept: raw.node ?? raw.concept,
    recall: ok ? 'hit' : 'miss',
    solve: null,
    durationMs: 0,
    note: raw.note ?? '',
  };
}

/**
 * 规范化一条事件。
 * @param {any} raw 任意来源的 JSON
 * @param {{ now?: string }} [opts]
 * @returns {object} 规范事件（可直接 append 到 jsonl）
 * @throws {DomainError}
 */
export function normalizeEvent(raw, opts = {}) {
  check(raw && typeof raw === 'object', 'bad-event');
  const now = opts.now ?? new Date().toISOString();
  const legacy = fromLegacy(raw);
  const src = legacy ? { ...raw, ...legacy } : raw;
  const at = stamp(src.at, now);

  switch (src.kind) {
    case 'attempt': {
      const concept = str(src.concept, 'bad-concept', 64);
      check(RE_CONCEPT.test(concept), 'bad-concept');
      const recall = src.recall;
      check(recall === 'hit' || recall === 'miss' || recall === 'recon', 'bad-recall');
      const solve = src.solve ?? null;
      check(solve === null || solve === 'ok' || solve === 'fail', 'bad-solve');
      const methods = src.methods === undefined ? [] : strList(src.methods, 'bad-method', LIMITS.methods);
      for (const m of methods) check(RE_METHOD.test(m), 'bad-method');
      check(methods.length <= LIMITS.methods, 'too-many-methods');
      const problem = src.problem == null ? null : str(src.problem, 'bad-problem', 64);
      if (problem) check(RE_PROBLEM.test(problem), 'bad-problem');
      const dur = Number(src.durationMs ?? 0);
      check(Number.isFinite(dur) && dur >= 0 && dur <= LIMITS.durationMs, 'bad-duration');
      const body = { concept, methods, problem, recall, solve, durationMs: Math.round(dur) };
      return {
        v: EVENT_VERSION, id: eventId(src.id, at, body), at, kind: 'attempt',
        ...body, note: clip(src.note, LIMITS.note),
      };
    }

    case 'daily': {
      check(isDate(src.date), 'bad-date');
      check(SUBJECTS.includes(src.subject), 'bad-subject');
      const min = Number(src.minutes ?? 0);
      check(Number.isFinite(min) && min >= 0 && min <= LIMITS.minutes, 'bad-minutes');
      const wrong = src.wrong === undefined ? [] : src.wrong;
      check(Array.isArray(wrong) && wrong.length <= LIMITS.wrongMax, 'bad-wrong');
      const nums = wrong.map((n) => {
        const v = Number(n);
        check(Number.isInteger(v) && v >= 1 && v <= 99, 'bad-wrong');
        return v;
      });
      const body = {
        date: src.date, subject: src.subject, minutes: Math.round(min),
        wrong: nums, blocked: src.blocked === true,
      };
      return {
        v: EVENT_VERSION, id: eventId(src.id, at, body), at, kind: 'daily',
        ...body, note: clip(src.note, LIMITS.note),
      };
    }

    case 'flatten':
    case 'unflatten': {
      const shard = str(src.shard, 'bad-shard', 80);
      check(RE_SHARD.test(shard), 'bad-shard');
      const body = { shard };
      return { v: EVENT_VERSION, id: eventId(src.id, at, body), at, kind: src.kind, shard };
    }

    case 'note': {
      const body = { text: clip(src.text, LIMITS.text) };
      check(body.text.length > 0, 'bad-text');
      const subject = src.subject ?? null;
      if (subject) check(SUBJECTS.includes(subject), 'bad-subject');
      return {
        v: EVENT_VERSION, id: eventId(src.id, at, body), at, kind: 'note',
        text: body.text, subject, ref: src.ref == null ? null : clip(src.ref, 80),
      };
    }

    case 'problem.new': {
      const id = str(src.id, 'bad-problem', 64);
      check(RE_PROBLEM.test(id), 'bad-problem');
      check(SUBJECTS.includes(src.subject), 'bad-subject');
      const concepts = strList(src.concepts ?? [], 'bad-concept', LIMITS.concepts);
      for (const c of concepts) check(RE_CONCEPT.test(c), 'bad-concept');
      check(concepts.length >= 1 && concepts.length <= LIMITS.concepts, 'bad-concept-count');
      const methods = strList(src.methods ?? [], 'bad-method', LIMITS.methods);
      for (const m of methods) check(RE_METHOD.test(m), 'bad-method');
      const difficulty = Number(src.difficulty ?? 3);
      check(Number.isInteger(difficulty)
        && difficulty >= LIMITS.difficultyMin
        && difficulty <= LIMITS.difficultyMax, 'bad-difficulty');
      const body = { id, subject: src.subject, concepts, methods, difficulty };
      return {
        v: EVENT_VERSION, id: eventId(src.eventId, at, body), at, kind: 'problem.new',
        ...body, source: clip(src.source, 80), text: clip(src.text, LIMITS.text),
        answer: clip(src.answer, LIMITS.text),
      };
    }

    case 'problem.edit': {
      const id = str(src.id, 'bad-problem', 64);
      check(RE_PROBLEM.test(id), 'bad-problem');
      const patch = {};
      if (src.status !== undefined) {
        check(src.status === 'open' || src.status === 'done' || src.status === 'dropped', 'bad-status');
        patch.status = src.status;
      }
      if (src.text !== undefined) patch.text = clip(src.text, LIMITS.text);
      if (src.note !== undefined) patch.note = clip(src.note, LIMITS.note);
      check(Object.keys(patch).length > 0, 'empty-patch');
      return { v: EVENT_VERSION, id: eventId(src.eventId, at, { id, patch }), at, kind: 'problem.edit', id, patch };
    }

    case 'method.new':
    case 'method.edit': {
      const id = str(src.id, 'bad-method', 64);
      check(RE_METHOD.test(id), 'bad-method');
      if (src.kind === 'method.edit') {
        const patch = src.patch && typeof src.patch === 'object' ? { ...src.patch } : {};
        for (const k of ['claim', 'judge', 'verified', 'note']) {
          if (src[k] !== undefined) patch[k] = src[k];
        }
        check(Object.keys(patch).length > 0, 'empty-patch');
        if (patch.claim !== undefined) patch.claim = clip(patch.claim, LIMITS.claim);
        if (patch.judge !== undefined) patch.judge = clip(patch.judge, LIMITS.text);
        return { v: EVENT_VERSION, id: eventId(src.eventId, at, { id, patch }), at, kind: 'method.edit', id, patch };
      }
      const claim = str(src.claim, 'bad-claim', LIMITS.claim);
      const judge = str(src.judge, 'bad-judge', LIMITS.text);
      const steps = strList(src.steps ?? [], 'bad-steps', 12, LIMITS.text);
      const instances = strList(src.instances ?? [], 'bad-instances', 8, LIMITS.text);
      const traps = strList(src.traps ?? [], 'bad-traps', 8, LIMITS.text);
      const points = strList(src.points ?? [], 'bad-concept', 12);
      for (const p of points) check(RE_CONCEPT.test(p), 'bad-concept');
      check(src.source === undefined || src.source === 'self' || src.source === 'ai', 'bad-source');
      const body = { id, claim, judge };
      return {
        v: EVENT_VERSION, id: eventId(src.eventId, at, body), at, kind: 'method.new',
        id, claim, judge, steps, instances, traps, points,
        source: src.source ?? 'ai', verified: src.verified === true,
        confidence: Number(src.confidence ?? 0.7),
      };
    }

    default:
      throw new DomainError('bad-kind', String(src.kind));
  }
}

/**
 * 把一条事件序列化成 jsonl 一行（不含换行符）。
 * @param {object} ev
 * @returns {string}
 */
export function toLine(ev) {
  return JSON.stringify(ev);
}

/**
 * 解析一行 jsonl；坏行返回 null（调用方负责计数），不抛。
 * @param {string} line
 * @returns {object|null}
 */
export function fromLine(line) {
  if (typeof line !== 'string' || !line.trim()) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
