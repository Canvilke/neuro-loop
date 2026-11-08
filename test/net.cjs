// NET 模块的单元测试：不跑 canvas，只验证"前端与宿主之间那条线"的语义。
// 关键断言：断网不丢事件、断网不阻塞、实测数据盖住静态数据、到期列表有序。

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'src', '045-net.js'), 'utf8');

let pass = 0;
const fails = [];
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ok    ' + msg);
  } else {
    fails.push(msg);
    console.error('  FAIL  ' + msg);
  }
}

/* ── 假环境 ─────────────────────────────────────────────────────────────── */
const store = {};
global.window = {
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
  },
};

global.STORE = { selected: 'math', flattened: [] };
global.saveStoreCalls = 0;
global.saveStore = () => {
  global.saveStoreCalls++;
};

const nodes = [
  {
    id: 'math-func',
    hit: 0.5,
    acc: 0.4,
    dueAt: new Date(Date.now() + 3600e3).toISOString(),
  },
  {
    id: 'math-deriv',
    hit: 0.5,
    acc: 0.4,
    dueAt: new Date(Date.now() - 2 * 86400e3).toISOString(),
  },
  {
    id: 'math-trig',
    hit: 0.5,
    acc: 0.4,
    dueAt: new Date(Date.now() - 5 * 3600e3).toISOString(),
  },
  { id: 'math-vector', hit: 0.5, acc: 0.4 },
];
global.BY_SUBJECT = { math: { id: 'math', nodes: nodes, hue: '#8fa8ff' }, chinese: { id: 'chinese', nodes: [] } };

let fetchMode = 'ok';
let lastPost = null;
global.fetch = function (url, opts) {
  if (fetchMode === 'fail') return Promise.reject(new Error('offline'));
  if (opts && opts.method === 'POST') {
    lastPost = JSON.parse(opts.body);
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          rev: (lastPost.rev || 0) + 1,
          state: { version: 1, rev: 7, flattened: [], nodes: {} },
        }),
    });
  }
  return Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        ok: true,
        state: {
          version: 1,
          rev: 12,
          flattened: ['sh:math:abc', 'sh:math:abc', 'sh:chem:zz'],
          nodes: { 'math-deriv': { hitRate: 0.25, streak: 0, dueAt: '2026-11-01T00:00:00.000Z' } },
        },
      }),
  });
};

vm.runInThisContext(src, { filename: '045-net.js' });

const tick = () => new Promise((r) => setTimeout(r, 0));

(async () => {
  /* 1. 队列持久化 */
  store['neuroloop.queue'] = JSON.stringify([{ kind: 'flatten', shard: 'sh:math:x' }]);
  nlQueueLoad();
  ok(NL_NET.queue.length === 1, '启动时读回上次没发出去的事件');

  /* 2. 断网：进队列、不抛、不阻塞 */
  fetchMode = 'fail';
  nlPost({ kind: 'recall', node: 'math-func', ok: 1 });
  await tick();
  ok(NL_NET.queue.length === 2, '发送失败的事件进入队列（不丢）');
  ok(NL_NET.online === false, '失败后标记 offline，界面可据此降级');
  ok(JSON.parse(store['neuroloop.queue'] || '[]').length === 2, '队列同时落到 localStorage');

  /* 3. 恢复网络后补发 */
  fetchMode = 'ok';
  nlQueueLoad();
  const before = NL_NET.queue.length;
  nlFlush();
  await tick();
  await tick();
  ok(before > 0, '补发前队列非空（' + before + '）');
  ok(NL_NET.queue.length === 0, '补发后队列清空');

  /* 4. GET 合并：去重 + 覆盖静态值 */
  global.STORE.flattened = ['sh:math:abc'];
  global.saveStoreCalls = 0;
  await new Promise((res) => nlSync(res));
  ok(NL_NET.online === true, 'sync 成功后 online');
  ok(NL_NET.rev === 12, 'rev 跟上宿主（' + NL_NET.rev + '）');
  ok(global.STORE.flattened.length === 2, 'flattened 合并去重（' + global.STORE.flattened.join(',') + '）');
  ok(global.saveStoreCalls === 1, '有新增才写 localStorage（' + global.saveStoreCalls + '）');
  ok(nodes[1].hit === 0.25, '实测命中率盖住 seed 的 0.5');

  /* 5. 到期列表：只要有 dueAt 且已到，按到期升序 */
  const due = nlDueNodes('math');
  ok(due.length === 2, '两个到期（其中一个未来不算，' + due.length + '）');
  ok(due[0].id === 'math-deriv', '越逾期越靠前（' + due[0].id + '）');
  ok(nlDueCount('math') === 2, '计数与列表一致');
  ok(nlDueCount('chinese') === 0, '空学科为 0');

  /* 6. 距离文案 */
  const inFuture = { dueAt: new Date(Date.now() + 3 * 86400e3).toISOString() };
  const overdue = { dueAt: new Date(Date.now() - 2 * 86400e3).toISOString() };
  ok(nlDueText(inFuture) === '在 3 天后', '未来 → 在 N 天后 (' + nlDueText(inFuture) + ')');
  ok(/逾期 2 天/.test(nlDueText(overdue)), '过去 → 逾期 N 天 (' + nlDueText(overdue) + ')');
  ok(nlDueText({}) === '未排期', '没有 dueAt → 未排期');

  /* 7. 判定的本地即时反馈 */
  lastPost = null;
  const nd = nodes[0];
  const beforeDue = Date.now();
  nlRecordRecall(nd, true);
  await tick();
  ok(nd.live.hits === 1 && nd.live.streak === 1, '答对：hits/streak 立即 +1');
  ok(nd.hit === 1, '答对：卡片上的命中率立刻变 1');
  ok(Date.parse(nd.dueAt) > beforeDue, '答对：排到未来');
  ok(lastPost && lastPost.kind === 'recall' && lastPost.node === 'math-func' && lastPost.ok === 1, '答对：同时发出一条 recall 事件');

  nlRecordRecall(nd, false);
  await tick();
  ok(nd.live.misses === 1 && nd.live.streak === 0, '答错：streak 清零');
  ok(nd.hit === 0.5, '答错：命中率回落到 0.5（' + nd.hit + '）');
  ok(lastPost.ok === 0, '答错：事件 ok=0');

  console.log('\nnet ok — ' + pass + ' checks');
  if (fails.length) {
    console.error('\n' + fails.length + ' failed');
    process.exit(1);
  }
  process.exit(0);
})();
