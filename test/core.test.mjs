/**
 * test/core.test.mjs —— core 层契约测试。
 *
 * 跑法：node --test test/core.test.mjs
 * 这些测试不碰文件系统、不碰网络、不依赖当前时间（时间全部传参）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { DomainError, SUBJECTS } from '../core/contract.js';
import { normalizeEvent } from '../core/events.js';
import { applyEvent, dueList, emptyState, rebuild, subjectStats } from '../core/state.js';
import {
  accuracy, cacheState, classify, dueAt, hitRate, intervalDays, isOk, ONE_DAY_MS,
} from '../core/metrics.js';

const NOW = '2026-11-10T00:00:00.000Z';
const at = (iso) => new Date(iso).toISOString();

/** 便捷：规范化并折叠一条事件。 */
function fold(state, raw) {
  return applyEvent(state, normalizeEvent(raw, { now: NOW }));
}

/** 断言某个调用抛出指定 code 的 DomainError。 */
function rejects(fn, code) {
  assert.throws(fn, (e) => e instanceof DomainError && e.code === code, `expected ${code}`);
}

test('契约：六科常量', () => {
  assert.equal(SUBJECTS.length, 6);
  assert.ok(SUBJECTS.includes('politics'));
});

test('规范化：attempt 的最小形态', () => {
  const ev = normalizeEvent({ kind: 'attempt', concept: 'math-deriv', recall: 'hit' }, { now: NOW });
  assert.equal(ev.v, 2);
  assert.equal(ev.kind, 'attempt');
  assert.equal(ev.solve, null);
  assert.equal(ev.durationMs, 0);
  assert.deepEqual(ev.methods, []);
  assert.match(ev.id, /^[a-z0-9]{8,20}$/);
});

test('规范化：拒绝非法输入', () => {
  rejects(() => normalizeEvent({ kind: 'nope' }, { now: NOW }), 'bad-kind');
  rejects(() => normalizeEvent({ kind: 'attempt', concept: 'Math Derive', recall: 'hit' }, { now: NOW }), 'bad-concept');
  rejects(() => normalizeEvent({ kind: 'attempt', concept: 'math-deriv', recall: 'maybe' }, { now: NOW }), 'bad-recall');
  rejects(() => normalizeEvent({ kind: 'attempt', concept: 'math-deriv', recall: 'hit', solve: 'yes' }, { now: NOW }), 'bad-solve');
  rejects(() => normalizeEvent({ kind: 'attempt', concept: 'math-deriv', recall: 'hit', durationMs: -1 }, { now: NOW }), 'bad-duration');
  rejects(() => normalizeEvent({ kind: 'attempt', concept: 'math-deriv', recall: 'hit', methods: ['bad'] }, { now: NOW }), 'bad-method');
  rejects(() => normalizeEvent({ kind: 'attempt', concept: 'math-deriv', recall: 'hit', at: 'not-a-date' }, { now: NOW }), 'bad-at');
});

test('规范化：attempt 的 methods 去重且限 3 个', () => {
  const ev = normalizeEvent({
    kind: 'attempt', concept: 'physics-momentum', recall: 'recon', solve: 'ok',
    methods: ['m.momentum-conserve', 'm.momentum-conserve', 'm.centroid-fixed'],
  }, { now: NOW });
  assert.deepEqual(ev.methods, ['m.momentum-conserve', 'm.centroid-fixed']);
  rejects(() => normalizeEvent({
    kind: 'attempt', concept: 'physics-momentum', recall: 'hit',
    methods: ['m.a', 'm.b', 'm.c', 'm.d'],
  }, { now: NOW }), 'too-many-methods');
});

test('规范化：daily 的日期、学科、分钟、错题', () => {
  const ev = normalizeEvent({
    kind: 'daily', date: '2026-11-10', subject: 'politics', minutes: 25, wrong: [3, 5], blocked: true,
  }, { now: NOW });
  assert.deepEqual(ev.wrong, [3, 5]);
  assert.equal(ev.blocked, ''); // 现在是卡点原文，布尔值丢弃
  rejects(() => normalizeEvent({ kind: 'daily', date: '2026-02-30', subject: 'politics' }, { now: NOW }), 'bad-date');
  rejects(() => normalizeEvent({ kind: 'daily', date: '2026-11-10', subject: 'history' }, { now: NOW }), 'bad-subject');
  rejects(() => normalizeEvent({ kind: 'daily', date: '2026-11-10', subject: 'politics', minutes: 601 }, { now: NOW }), 'bad-minutes');
  rejects(() => normalizeEvent({ kind: 'daily', date: '2026-11-10', subject: 'politics', wrong: [0] }, { now: NOW }), 'bad-wrong');
});

test('规范化：flatten 的碎片键', () => {
  const ev = normalizeEvent({ kind: 'flatten', shard: 'sh:politics:1a2b3c' }, { now: NOW });
  assert.equal(ev.kind, 'flatten');
  rejects(() => normalizeEvent({ kind: 'flatten', shard: 'politics:3' }, { now: NOW }), 'bad-shard');
});

test('规范化：method.new 的 claim 上限 40 字', () => {
  const ok = normalizeEvent({
    kind: 'method.new', id: 'm.x', claim: '质心不变', judge: '判断依据', points: ['physics-momentum'],
  }, { now: NOW });
  assert.equal(ok.source, 'ai');
  assert.equal(ok.verified, false);
  rejects(() => normalizeEvent({
    kind: 'method.new', id: 'm.x', claim: '一'.repeat(41), judge: 'j',
  }, { now: NOW }), 'bad-claim-too-long');
});

test('v1 兼容：recall 映射为 attempt', () => {
  const ok = normalizeEvent({ kind: 'recall', node: 'math-deriv', ok: true }, { now: NOW });
  assert.equal(ok.kind, 'attempt');
  assert.equal(ok.recall, 'hit');
  assert.equal(ok.solve, null);

  const bad = normalizeEvent({ kind: 'review', node: 'math-deriv', ok: false }, { now: NOW });
  assert.equal(bad.recall, 'miss');
});

test('事件 id 与内容/时间绑定', () => {
  const a = normalizeEvent({ kind: 'attempt', concept: 'math-deriv', recall: 'hit' }, { now: NOW });
  const b = normalizeEvent({ kind: 'attempt', concept: 'math-deriv', recall: 'hit' }, { now: NOW });
  const c = normalizeEvent({ kind: 'attempt', concept: 'math-deriv', recall: 'miss' }, { now: NOW });
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, c.id);
});

test('折叠：命中/未命中/重推分别计数', () => {
  let s = emptyState();
  s = fold(s, { kind: 'attempt', concept: 'math-deriv', recall: 'hit' });
  s = fold(s, { kind: 'attempt', concept: 'math-deriv', recall: 'miss' });
  s = fold(s, { kind: 'attempt', concept: 'math-deriv', recall: 'recon' });
  const c = s.concepts['math-deriv'];
  assert.equal(c.attempts, 3);
  assert.equal(c.hits, 1);
  assert.equal(c.misses, 1);
  assert.equal(c.recon, 1);
  assert.equal(hitRate(c), 0.5);
  assert.equal(s.rev, 3);
  assert.equal(s.events, 3);
});

test('折叠：命中 + 实做失败 = 假阳性', () => {
  let s = emptyState();
  s = fold(s, { kind: 'attempt', concept: 'physics-magnetic', recall: 'hit', solve: 'fail' });
  const c = s.concepts['physics-magnetic'];
  assert.equal(c.fp, 1);
  assert.equal(classify(c), 'fragile');
  assert.equal(isOk({ recall: 'hit', solve: 'fail' }), false);
});

test('折叠：连续成功推高间隔，失败重置', () => {
  let s = emptyState();
  s = fold(s, { kind: 'attempt', concept: 'math-trig', recall: 'hit', solve: 'ok', at: at('2026-11-01T00:00:00Z') });
  s = fold(s, { kind: 'attempt', concept: 'math-trig', recall: 'hit', solve: 'ok', at: at('2026-11-02T00:00:00Z') });
  s = fold(s, { kind: 'attempt', concept: 'math-trig', recall: 'hit', solve: 'ok', at: at('2026-11-03T00:00:00Z') });
  let c = s.concepts['math-trig'];
  assert.equal(c.streak, 3);
  // 第三次成功：2^(3-1) = 4 天
  assert.equal(c.dueAt, at('2026-11-07T00:00:00Z'));
  s = fold(s, { kind: 'attempt', concept: 'math-trig', recall: 'miss', at: at('2026-11-04T00:00:00Z') });
  c = s.concepts['math-trig'];
  assert.equal(c.streak, 0);
  assert.equal(c.dueAt, at('2026-11-05T00:00:00Z'));
});

test('折叠：daily 以日期+学科为键', () => {
  let s = emptyState();
  s = fold(s, { kind: 'daily', date: '2026-11-10', subject: 'politics', minutes: 25, wrong: [3] });
  s = fold(s, { kind: 'daily', date: '2026-11-10', subject: 'english', minutes: 15 });
  assert.equal(s.daily['2026-11-10'].politics.minutes, 25);
  assert.equal(s.daily['2026-11-10'].english.minutes, 15);
  assert.equal(Object.keys(s.daily).length, 1);
});

test('折叠：flatten / unflatten 可撤销', () => {
  let s = emptyState();
  s = fold(s, { kind: 'flatten', shard: 'sh:politics:abc123' });
  assert.equal(s.flattened['sh:politics:abc123'], true);
  s = fold(s, { kind: 'unflatten', shard: 'sh:politics:abc123' });
  assert.equal(s.flattened['sh:politics:abc123'], undefined);
});

test('折叠：problem.new 与 method.new 进各自表', () => {
  let s = emptyState();
  s = fold(s, {
    kind: 'problem.new', id: 'p.2026-11-10.001', subject: 'physics',
    concepts: ['physics-momentum'], methods: ['m.momentum-conserve'], difficulty: 4,
  });
  assert.equal(s.problems['p.2026-11-10.001'].status, 'open');
  s = fold(s, {
    kind: 'method.new', id: 'm.momentum-conserve', claim: '动量守恒', judge: '合外力为零',
    points: ['physics-momentum'],
  });
  assert.equal(s.methods['m.momentum-conserve'].claim, '动量守恒');
  s = fold(s, { kind: 'method.edit', id: 'm.momentum-conserve', patch: { verified: true } });
  assert.equal(s.methods['m.momentum-conserve'].verified, true);
});

test('折叠：方法使用次数跟着 attempt 走', () => {
  let s = emptyState();
  s = fold(s, {
    kind: 'attempt', concept: 'physics-momentum', recall: 'hit', solve: 'ok',
    methods: ['m.momentum-conserve'],
  });
  assert.equal(s.methods['m.momentum-conserve'].uses, 1);
  assert.equal(s.methods['m.momentum-conserve'].ok, 1);
  assert.equal(s.concepts['physics-momentum'].methods['m.momentum-conserve'], 1);
});

test('重建 == 增量（同一批事件）', () => {
  const raws = [
    { kind: 'attempt', concept: 'math-deriv', recall: 'hit', solve: 'ok' },
    { kind: 'attempt', concept: 'math-deriv', recall: 'miss' },
    { kind: 'attempt', concept: 'physics-work', recall: 'recon', solve: 'fail', methods: ['m.energy-conserve'] },
    { kind: 'daily', date: '2026-11-10', subject: 'math', minutes: 30, wrong: [1, 2] },
    { kind: 'flatten', shard: 'sh:math:zzz999' },
  ];
  const events = raws.map((r) => normalizeEvent(r, { now: NOW }));

  const inc = events.reduce((s, e) => applyEvent(s, e), emptyState());
  const full = rebuild(events);
  assert.deepEqual(full.concepts, inc.concepts);
  assert.deepEqual(full.daily, inc.daily);
  assert.deepEqual(full.flattened, inc.flattened);
  assert.equal(full.rev, inc.rev);
});

test('重建：计数与顺序无关', () => {
  const raws = [
    { kind: 'attempt', concept: 'math-deriv', recall: 'hit', at: at('2026-11-01T00:00:00Z') },
    { kind: 'attempt', concept: 'math-deriv', recall: 'miss', at: at('2026-11-02T00:00:00Z') },
    { kind: 'attempt', concept: 'math-deriv', recall: 'hit', at: at('2026-11-03T00:00:00Z') },
  ];
  const a = rebuild(raws.map((r) => normalizeEvent(r, { now: NOW })));
  const b = rebuild([...raws].reverse().map((r) => normalizeEvent(r, { now: NOW })));
  assert.equal(a.concepts['math-deriv'].hits, b.concepts['math-deriv'].hits);
  assert.equal(a.concepts['math-deriv'].misses, b.concepts['math-deriv'].misses);
});

test('指标：准确率 null 与 0 有别', () => {
  assert.equal(accuracy({ solveOk: 0, solveFail: 0 }), null);
  assert.equal(accuracy({ solveOk: 0, solveFail: 2 }), 0);
  assert.equal(accuracy({ solveOk: 1, solveFail: 1 }), 0.5);
});

test('指标：间隔与上限', () => {
  assert.equal(intervalDays(1, true), 1);
  assert.equal(intervalDays(2, true), 2);
  assert.equal(intervalDays(3, true), 4);
  assert.equal(intervalDays(10, true), 45);
  assert.equal(intervalDays(9, false), 1);
  assert.equal(dueAt(at('2026-11-01T00:00:00Z'), 2), at('2026-11-03T00:00:00Z'));
  assert.equal(ONE_DAY_MS, 86_400_000);
});

test('指标：分类三态', () => {
  assert.equal(classify({ attempts: 0, hits: 0, misses: 0, fp: 0, solveOk: 0, solveFail: 0 }), 'unknown');
  assert.equal(classify({ attempts: 4, hits: 4, misses: 0, fp: 0, solveOk: 4, solveFail: 0 }), 'stable');
  assert.equal(classify({ attempts: 4, hits: 1, misses: 3, fp: 0, solveOk: 0, solveFail: 0 }), 'fragile');
});

test('指标：缓存三态', () => {
  const now = new Date('2026-11-10T00:00:00Z').getTime();
  assert.equal(cacheState({ attempts: 0, dueAt: null }, now), 'none');
  assert.equal(cacheState({ attempts: 2, dueAt: at('2026-11-12T00:00:00Z') }, now), 'fresh');
  assert.equal(cacheState({ attempts: 2, dueAt: at('2026-11-01T00:00:00Z') }, now), 'stale');
});

test('查询：到期清单按时间升序且只含已到期', () => {
  let s = emptyState();
  s = fold(s, { kind: 'attempt', concept: 'math-trig', recall: 'hit', solve: 'ok', at: at('2026-11-01T00:00:00Z') });
  s = fold(s, { kind: 'attempt', concept: 'math-deriv', recall: 'miss', at: at('2026-11-09T00:00:00Z') });
  const now = new Date('2026-11-10T12:00:00Z').getTime();
  const due = dueList(s, now, 5);
  assert.equal(due.length, 2);
  // 越逾期越前：math-trig 11-02 就到期，math-deriv 11-10 才到期
  assert.equal(due[0].id, 'math-trig');
  assert.equal(due[1].id, 'math-deriv');
});

test('查询：学科聚合按 id 前缀', () => {
  let s = emptyState();
  s = fold(s, { kind: 'attempt', concept: 'math-deriv', recall: 'hit', solve: 'ok' });
  s = fold(s, { kind: 'attempt', concept: 'physics-work', recall: 'miss' });
  s = fold(s, { kind: 'attempt', concept: 'unknown-thing', recall: 'hit' });
  const st = subjectStats(s, Date.now());
  assert.equal(st.math.attempts, 1);
  assert.equal(st.physics.misses, 1);
  assert.equal(st.other.attempts, 1);
});
