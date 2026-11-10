/**
 * test/storage.test.mjs —— L1 读写与 SQLite 投影的契约测试。
 *
 * 跑法：node --test test/storage.test.mjs
 * 每个用例用独立临时目录，不碰真实数据。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { normalizeEvent } = await import('../core/events.js');
const { rebuild: coreRebuild } = await import('../core/state.js');
const ev = await import('../storage/events.js');
const pj = await import('../storage/projection.js');

/** 建临时根并设为 NEUROLOOP_HOME。 */
function tempHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-store-'));
  process.env.NEUROLOOP_HOME = dir;
  return dir;
}

/** 规范化一段 v2 原始事件。 */
function makeEvents(raws, now = '2026-11-10T00:00:00.000Z') {
  return raws.map((r) => normalizeEvent(r, { now }));
}

/** 按 id 排序，消除顺序差异。 */
function sortRows(rows, key = 'id') {
  return [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
}

test('L1：追加后能按序读回', () => {
  const dir = tempHome();
  const events = makeEvents([
    { kind: 'attempt', concept: 'math-deriv', recall: 'hit', at: '2026-11-01T00:00:00Z' },
    { kind: 'attempt', concept: 'math-deriv', recall: 'miss', at: '2026-11-02T00:00:00Z' },
    { kind: 'daily', date: '2026-11-02', subject: 'math', minutes: 30 },
  ]);
  for (const e of events) ev.append(e);

  const read = ev.readAll();
  assert.equal(read.files, 1);
  assert.equal(read.events.length, 3);
  assert.equal(read.bad, 0);
  assert.equal(read.events[0].kind, 'attempt');
  assert.equal(fs.readdirSync(dir).filter((n) => n.startsWith('events-')).length, 1);
});

test('L1：坏行与截断行只计数不抛错', () => {
  tempHome();
  const file = path.join(ev.ensureRoot(), 'events-2026-11.jsonl');
  fs.writeFileSync(file, [
    JSON.stringify(makeEvents([{ kind: 'attempt', concept: 'math-trig', recall: 'hit' }])[0]),
    '{"broken": ',
    '',
    JSON.stringify({ k: 'recall', t: '2026-11-03T00:00:00Z', n: 'math-trig', ok: false }),
  ].join('\n'), 'utf8');

  const read = ev.readAll();
  assert.equal(read.events.length, 2, '一条 v2 + 一条 v1');
  assert.equal(read.bad, 1);
  assert.equal(read.events[1].kind, 'attempt');
  assert.equal(read.events[1].recall, 'miss');
});

test('L1：v1 短字段行被翻译成 v2', () => {
  const line = JSON.stringify({ k: 'recall', t: '2026-11-01T08:00:00Z', n: 'physics-work', ok: true });
  const parsed = ev.parseLine(line, '2026-11-10T00:00:00Z');
  assert.equal(parsed.kind, 'attempt');
  assert.equal(parsed.concept, 'physics-work');
});

test('投影：增量写入 == 全量重建', () => {
  tempHome();
  const events = makeEvents([
    { kind: 'attempt', concept: 'math-deriv', recall: 'hit', solve: 'ok', methods: ['m.deriv-monotonic'] },
    { kind: 'attempt', concept: 'math-deriv', recall: 'hit', solve: 'fail', methods: ['m.deriv-monotonic'] },
    { kind: 'attempt', concept: 'math-deriv', recall: 'miss' },
    { kind: 'daily', date: '2026-11-10', subject: 'math', minutes: 25, wrong: [2] },
    { kind: 'flatten', shard: 'sh:math:aaa111' },
    { kind: 'unflatten', shard: 'sh:math:aaa111' },
    { kind: 'note', text: '漏了定义域' },
    { kind: 'method.new', id: 'm.deriv-monotonic', claim: '导数看单调', judge: '区间内看符号' },
  ]);

  const inc = pj.openDb(':memory:');
  for (const e of events) pj.applyIncremental(inc, e);
  const incDump = pj.dump(inc);

  const fullDb = pj.openDb(':memory:');
  pj.rebuild(fullDb, events);
  const fullDump = pj.dump(fullDb);

  assert.deepEqual(sortRows(incDump.concepts), sortRows(fullDump.concepts));
  assert.deepEqual(sortRows(incDump.methods), sortRows(fullDump.methods));
  assert.deepEqual(sortRows(incDump.daily, 'date'), sortRows(fullDump.daily, 'date'));
  assert.equal(incDump.flattened.length, fullDump.flattened.length);
  assert.equal(incDump.notes.length, fullDump.notes.length);
});

test('投影：与 core 的计数一致', () => {
  tempHome();
  const events = makeEvents([
    { kind: 'attempt', concept: 'physics-momentum', recall: 'hit', solve: 'fail' },
    { kind: 'attempt', concept: 'physics-momentum', recall: 'hit', solve: 'ok' },
    { kind: 'attempt', concept: 'physics-momentum', recall: 'miss' },
  ]);
  const db = pj.openDb(':memory:');
  pj.rebuild(db, events);
  const row = db.prepare('SELECT * FROM concepts WHERE id = ?').get('physics-momentum');
  const core = coreRebuild(events).concepts['physics-momentum'];

  assert.equal(row.attempts, core.attempts);
  assert.equal(row.hits, core.hits);
  assert.equal(row.misses, core.misses);
  assert.equal(row.fp, core.fp);
  assert.equal(row.streak, core.streak);
  assert.equal(row.due_at, core.dueAt);
});

test('投影：删库后重建结果一致', () => {
  const dir = tempHome();
  const events = makeEvents([
    { kind: 'attempt', concept: 'math-seq', recall: 'hit' },
    { kind: 'daily', date: '2026-11-10', subject: 'math', minutes: 20 },
  ]);
  const file = path.join(dir, 'projection.db');

  const db1 = pj.openDb(file);
  pj.rebuild(db1, events);
  const before = pj.dump(db1);
  db1.close();

  fs.rmSync(file, { force: true });
  fs.rmSync(`${file}-wal`, { force: true });
  fs.rmSync(`${file}-shm`, { force: true });

  const db2 = pj.openDb(file);
  pj.rebuild(db2, events);
  const after = pj.dump(db2);
  db2.close();

  assert.deepEqual(sortRows(before.concepts), sortRows(after.concepts));
  assert.equal(after.daily.length, 1);
});

test('投影：到期查询按时间升序且可限量', () => {
  tempHome();
  const events = makeEvents([
    { kind: 'attempt', concept: 'math-trig', recall: 'hit', at: '2026-11-01T00:00:00Z' },
    { kind: 'attempt', concept: 'math-deriv', recall: 'miss', at: '2026-11-09T00:00:00Z' },
  ]);
  const db = pj.openDb(':memory:');
  pj.rebuild(db, events);
  const now = new Date('2026-11-10T12:00:00Z').getTime();
  const due = pj.dueList(db, now, 5);
  assert.equal(due.length, 2);
  assert.equal(due[0].id, 'math-trig');
  assert.equal(pj.dueList(db, now, 1).length, 1);
});

test('性能：一万条事件重建 < 2s', () => {
  tempHome();
  const raws = [];
  for (let i = 0; i < 10_000; i += 1) {
    const day = String(1 + (i % 28)).padStart(2, '0');
    raws.push({
      kind: 'attempt',
      concept: i % 3 === 0 ? 'math-deriv' : i % 3 === 1 ? 'physics-work' : 'english-words',
      recall: i % 4 === 0 ? 'miss' : 'hit',
      solve: i % 5 === 0 ? 'fail' : 'ok',
      at: `2026-10-${day}T08:00:00Z`,
    });
  }
  const events = makeEvents(raws);
  const db = pj.openDb(':memory:');
  const r = pj.rebuild(db, events);
  assert.equal(r.events, 10_000);
  assert.ok(r.ms < 2000, `重建耗时 ${r.ms}ms，超过 2s`);
  const row = db.prepare('SELECT attempts FROM concepts WHERE id = ?').get('math-deriv');
  assert.ok(row.attempts > 3000);
});
