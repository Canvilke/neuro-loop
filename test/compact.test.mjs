/**
 * test/compact.test.mjs —— 事件归档压缩（snapshot 折叠）的契约测试。
 *
 * 跑法：node --test test/compact.test.mjs（本机沙箱下直接 `node test/compact.test.mjs` 也能跑）
 * 每个用例用独立临时目录，不碰真实数据。
 *
 * 这一组测的就是一句话：**折了快照以后，从磁盘重建出来的 state 必须与折之前全量重放逐字节相同。**
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const { normalizeEvent } = await import('../core/events.js');
const { rebuild } = await import('../core/state.js');
const compact = await import('../core/compact.js');
const ev = await import('../storage/events.js');
const cli = await import('../tools/compact.mjs');

/** 建临时根并设为 NEUROLOOP_HOME。 */
function tempHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-compact-'));
  process.env.NEUROLOOP_HOME = dir;
  return dir;
}

/** 规范化一段 v2 原始事件。 */
function makeEvents(raws, now = '2026-11-10T00:00:00.000Z') {
  return raws.map((r) => normalizeEvent(r, { now }));
}

/** 十月三条、十一月两条，覆盖 attempt / daily / note / method.new 四种折叠路径。 */
const OCT_RAW = [
  { kind: 'attempt', concept: 'math-deriv', recall: 'hit', solve: 'ok', methods: ['m.deriv-monotonic'], at: '2026-10-05T08:00:00+08:00' },
  { kind: 'attempt', concept: 'math-deriv', recall: 'miss', at: '2026-10-06T08:00:00+08:00' },
  { kind: 'daily', date: '2026-10-06', subject: 'math', minutes: 40, wrong: [3], at: '2026-10-06T22:00:00+08:00' },
];
const NOV_RAW = [
  { kind: 'attempt', concept: 'physics-work', recall: 'hit', solve: 'fail', at: '2026-11-03T08:00:00+08:00' },
  { kind: 'note', text: '漏了定义域', subject: 'math', at: '2026-11-09T22:00:00+08:00' },
  { kind: 'method.new', id: 'm.deriv-monotonic', claim: '导数看单调', judge: '区间内看符号', at: '2026-11-04T08:00:00+08:00' },
];

const OCT = makeEvents(OCT_RAW);
const NOV = makeEvents(NOV_RAW);
const ALL = [...OCT, ...NOV];

/** 把两个月都落到磁盘。 */
function seed() {
  for (const e of OCT) ev.append(e);
  for (const e of NOV) ev.append(e);
}

test('月份口径：快照名、文件名解析与 storage 的 monthFile 是同一把尺子', () => {
  assert.equal(compact.monthOfFile('events-2026-10.jsonl'), '2026-10');
  assert.equal(compact.monthOfFile('snapshot-2026-10.json'), '2026-10');
  assert.equal(compact.monthOfFile('notes.md'), null);
  assert.equal(compact.snapshotFileName('2026-10'), 'snapshot-2026-10.json');

  // 本地时区的月末 23:30 必须落在当月（跨时区实现最容易在这里错一天）
  const edge = new Date(2026, 9, 31, 23, 30);
  assert.equal(compact.monthOfAt(edge), '2026-10');
  assert.equal(ev.monthFile(edge), `events-${compact.monthOfAt(edge)}.jsonl`);

  assert.throws(() => compact.snapshotFileName('2026-13'), (e) => e.code === 'bad-snapshot-month');
  assert.equal(compact.isMonth('2026-00'), false);
});

test('快照：一个月的折叠 = 该月事件的前缀态', () => {
  const snap = compact.snapshotOf('2026-10', OCT);
  assert.equal(snap.month, '2026-10');
  assert.equal(snap.rev, 3);
  assert.equal(snap.events, 3);
  assert.equal(snap.firstAt, OCT[0].at);
  assert.equal(snap.concepts['math-deriv'].attempts, 2);
  assert.equal(snap.concepts['math-deriv'].hits, 1);
  assert.equal(snap.methods['m.deriv-monotonic'].uses, 1);
  assert.equal(snap.daily['2026-10-06'].math.minutes, 40);
  assert.equal(compact.isSnapshot(snap), true);
});

test('快照：跨月事件被拒（不静默混月）', () => {
  assert.throws(() => compact.snapshotOf('2026-10', [NOV[0]]), (e) => e.code === 'bad-snapshot-month');
});

test('快照：形状校验拦住坏快照', () => {
  const snap = compact.snapshotOf('2026-10', OCT);
  assert.equal(compact.isSnapshot(null), false);
  assert.equal(compact.isSnapshot({ ...snap, v: 2 }), false);
  assert.equal(compact.isSnapshot({ ...snap, month: '2026-13' }), false);
  assert.equal(compact.isSnapshot({ ...snap, notes: null }), false);
  assert.equal(compact.isSnapshot({ ...snap, rev: -1 }), false);
});

test('重建：快照 + 尾部 == 全量重放（逐字节）', () => {
  const snap = compact.snapshotOf('2026-10', OCT);
  const full = rebuild(ALL);
  const folded = compact.rebuildFromBase([snap], NOV);

  assert.equal(folded.rev, full.rev);
  assert.equal(JSON.stringify(folded), JSON.stringify(full), '折叠后的 state 必须逐字节等于全量重放');
  assert.ok(compact.equalState(folded, full));
});

test('重建：尾部里落在快照月份内的事件不双计', () => {
  const snap = compact.snapshotOf('2026-10', OCT);
  const full = rebuild(ALL);
  // 模拟"快照写完、原文件还没归档"的中间态：快照覆盖的 10 月事件还在尾部里
  const folded = compact.rebuildFromBase([snap], ALL);
  assert.equal(folded.rev, full.rev);
  assert.equal(JSON.stringify(folded), JSON.stringify(full));
});

test('重建：最新快照整体替换旧快照，不叠加', () => {
  const oct = compact.snapshotOf('2026-10', OCT);
  // 11 月快照是"累计前缀态"：10 月 + 11 月一起折
  const nov = compact.snapshotFromState('2026-11', rebuild(ALL), { firstAt: OCT[0].at });
  const full = rebuild(ALL);
  const folded = compact.rebuildFromBase([oct, nov], NOV);
  assert.equal(folded.rev, full.rev);
  assert.equal(JSON.stringify(folded), JSON.stringify(full));
});

test('落盘：快照写读逐字节一致', () => {
  tempHome();
  const snap = compact.snapshotOf('2026-10', OCT);
  const written = ev.writeSnapshot(snap);
  assert.equal(fs.readFileSync(written.file, 'utf8'), `${JSON.stringify(snap)}\n`);

  const back = ev.readSnapshot(written.file);
  assert.deepEqual(back, snap);
  assert.equal(JSON.stringify(back), JSON.stringify(snap));
  assert.equal(ev.listSnapshots().length, 1);
});

test('落盘：坏快照被 readSnapshot 挡成 null，不当快照用', () => {
  const dir = tempHome();
  const file = path.join(dir, 'snapshot-2026-10.json');
  fs.writeFileSync(file, '{"v":1,"month":', 'utf8');
  assert.equal(ev.readSnapshot(file), null);
  assert.equal(ev.readAll().base, null);
});

test('归档：gzip 后原文可完整还原，根目录那份消失', () => {
  tempHome();
  for (const e of OCT) ev.append(e);
  const src = path.join(ev.rootDir(), 'events-2026-10.jsonl');
  const original = fs.readFileSync(src, 'utf8');

  const arc = ev.archiveMonth('2026-10');
  assert.ok(arc, '应当返回归档结果');
  assert.equal(fs.existsSync(src), false);
  assert.equal(zlib.gunzipSync(fs.readFileSync(arc.archive)).toString('utf8'), original);
  assert.equal(ev.listFiles().length, 0);
  assert.equal(ev.listArchives().length, 1);
  assert.equal(ev.archiveMonth('2026-10'), null, '原文已归档，再跑一次返回 null');

  // 同月再次出现（比如手工恢复）时拒绝覆盖
  fs.writeFileSync(src, original, 'utf8');
  assert.throws(() => ev.archiveMonth('2026-10'), (e) => e.code === 'archive-exists');
});

test('readAll：有快照时整月跳过，rev 是逻辑事件总数', () => {
  tempHome();
  seed();
  const oct = compact.snapshotOf('2026-10', OCT);
  ev.writeSnapshot(oct);

  const read = ev.readAll();
  assert.equal(read.base, '2026-10');
  assert.equal(read.snapshots, 1);
  assert.equal(read.skippedFiles, 1);
  assert.equal(read.events.length, NOV.length, '尾部只剩 11 月');
  assert.equal(read.rev, ALL.length, 'rev 要算上被快照覆盖的那 3 条');
  assert.equal(read.total, ALL.length);
  assert.equal(read.bad, 0);
});

test('readAll：没有快照时与归档功能上线前完全一致', () => {
  tempHome();
  seed();
  const read = ev.readAll();
  assert.equal(read.base, null);
  assert.equal(read.snapshots, 0);
  assert.equal(read.skippedFiles, 0);
  assert.equal(read.events.length, ALL.length);
  assert.equal(read.rev, read.events.length);
  assert.equal(read.files, 2);
});

test('计划：只挑已经结束的月份，当月不折', () => {
  tempHome();
  seed();
  const now = new Date('2026-11-13T03:00:00+08:00');
  const p = cli.plan({ now });
  assert.deepEqual(p.months, ['2026-10']);
  assert.equal(p.current, '2026-11');
  assert.ok(p.ignored.includes('2026-11'));
  assert.equal(p.rev, ALL.length);

  assert.throws(
    () => cli.plan({ month: '2026-11', now }),
    (e) => e.code === 'incomplete-month',
  );
});

test('apply：没开 allow-projection-gap 时被闸住', () => {
  tempHome();
  seed();
  assert.throws(() => cli.applyPlan(['2026-10'], {}), (e) => e.code === 'projection-gap');
});

test('apply：折叠后重建逐字节一致，且第二次跑无事可做', () => {
  tempHome();
  seed();
  const full = rebuild(ALL);
  const now = new Date('2026-11-13T03:00:00+08:00');

  const report = cli.applyPlan(['2026-10'], { allowProjectionGap: true, now });
  assert.equal(report.done.length, 1);
  assert.equal(report.done[0].month, '2026-10');
  assert.equal(report.done[0].events, OCT.length);
  assert.ok(report.done[0].gzBytes > 0);
  assert.equal(fs.existsSync(report.done[0].archive), true);

  const after = ev.readAll();
  assert.equal(after.base, '2026-10');
  assert.equal(after.rev, ALL.length, '折叠不能改变逻辑事件数');
  const folded = compact.rebuildFromBase(after.bases, after.events);
  assert.equal(JSON.stringify(folded), JSON.stringify(full), '折叠后重建必须逐字节等于折叠前');

  // 幂等：已经折过的月份不再出现在计划里
  assert.deepEqual(cli.plan({ now }).months, []);
  const again = cli.applyPlan(['2026-10'], { allowProjectionGap: true, now });
  assert.deepEqual(again.done, [{ month: '2026-10', skipped: 'archived' }]);
  assert.equal(ev.readAll().rev, ALL.length);

  // 归档体积应当比原文小
  assert.ok(report.done[0].gzBytes <= report.done[0].bytes);
});

test('CLI：参数错误给出可读的拒绝码', () => {
  tempHome();
  assert.throws(() => cli.parseArgs(['--month']), (e) => e.code === 'bad-args');
  assert.throws(() => cli.parseArgs(['--nope']), (e) => e.code === 'bad-args');
  assert.equal(cli.parseArgs(['--month', '2026-10', '--apply']).month, '2026-10');
});
