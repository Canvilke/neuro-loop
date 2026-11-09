/**
 * test/legacy.test.mjs —— 交叉验证：v1 的 fold 与 core 的 rebuild 在计数上必须一致。
 *
 * 为什么要这个测试：core 是重写，重写最容易在"边界情形"上悄悄改行为。
 * 这里拿 v1 的实现当 oracle，同一条事件序列喂给两边，只比对双方都有的字段。
 *
 * 已知的有意差异（不在比对范围内）：
 *   - 失败后的间隔：v1 是 8 小时，core 是 1 天（ADR-0001 之后统一按天）。
 *   - core 多了 recon / solve / fp / duration 四个维度，v1 没有。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// host/store.js 在 import 时读 NEUROLOOP_HOME，所以必须先设环境变量再动态 import。
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-legacy-'));
process.env.NEUROLOOP_HOME = tmp;

const store = await import('../host/store.js');
const { fromLegacy } = await import('../storage/legacy.js');
const { normalizeEvent } = await import('../core/events.js');
const { rebuild } = await import('../core/state.js');

/** 一段有代表性的 v1 事件流：错一次 → 连对两次 → 再错。 */
const SEQ = [
  { k: 'recall', t: '2026-11-01T08:00:00.000Z', n: 'math-deriv', ok: false },
  { k: 'recall', t: '2026-11-02T08:00:00.000Z', n: 'math-deriv', ok: true },
  { k: 'recall', t: '2026-11-03T08:00:00.000Z', n: 'math-deriv', ok: true },
  { k: 'recall', t: '2026-11-04T08:00:00.000Z', n: 'physics-work', ok: true },
  { k: 'recall', t: '2026-11-05T08:00:00.000Z', n: 'math-deriv', ok: false },
  { k: 'note', t: '2026-11-05T09:00:00.000Z', n: 'math-deriv', note: '把定义域漏了' },
  { k: 'flatten', t: '2026-11-05T10:00:00.000Z', s: 'sh:math:abc123' },
  { k: 'unflatten', t: '2026-11-06T10:00:00.000Z', s: 'sh:math:abc123' },
  { k: 'daily', t: '2026-11-05T22:00:00.000Z', d: '2026-11-05', s: 'math', min: 40, w: [1, 3], blk: false },
];

test('v1 fold 与 core rebuild：hits/misses/streak 一致', () => {
  const legacy = SEQ.reduce((s, ev) => store.fold(s, ev), store.emptyState());
  store.derive(legacy);

  const modern = rebuild(SEQ.map((ev) => {
    const mapped = fromLegacy(ev);
    assert.ok(mapped, `adapter 无法翻译 ${ev.k}`);
    return normalizeEvent(mapped, { now: mapped.at });
  }));

  for (const id of ['math-deriv', 'physics-work']) {
    const a = legacy.nodes[id];
    const b = modern.concepts[id];
    assert.ok(a, `v1 缺少 ${id}`);
    assert.ok(b, `core 缺少 ${id}`);
    assert.equal(b.hits, a.hits, `${id} hits`);
    assert.equal(b.misses, a.misses, `${id} misses`);
    assert.equal(b.streak, a.streak, `${id} streak`);
    assert.equal(b.lastAt, a.lastAt, `${id} lastAt`);
  }
  assert.equal(modern.rev, legacy.rev, 'rev 应等于事件条数');
});

test('adapter：daily 与 flatten 的形态', () => {
  const daily = normalizeEvent(fromLegacy(SEQ[8]), { now: SEQ[8].t });
  assert.equal(daily.kind, 'daily');
  assert.equal(daily.minutes, 40);
  assert.deepEqual(daily.wrong, [1, 3]);

  const flat = normalizeEvent(fromLegacy(SEQ[6]), { now: SEQ[6].t });
  assert.equal(flat.kind, 'flatten');
  assert.equal(flat.shard, 'sh:math:abc123');
});

test('adapter：未知类型返回 null 而不是抛错', () => {
  assert.equal(fromLegacy({ k: 'wat', t: '2026-11-01T00:00:00Z', n: 'x' }), null);
  assert.equal(fromLegacy(null), null);
  assert.equal(fromLegacy({ t: '2026-11-01T00:00:00Z' }), null);
});

test('adapter：recall 的 ok 缺省视为命中（v1 的写法）', () => {
  const mapped = fromLegacy({ k: 'recall', t: '2026-11-01T00:00:00Z', n: 'math-trig' });
  assert.equal(mapped.recall, 'hit');
});

test.after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});
