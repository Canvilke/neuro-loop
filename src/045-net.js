/* NET — 客户端与宿主半边之间唯一的一条线。
 *
 * 设计约束（决定了这里的写法）：
 *   1. 网络永远可能是坏的。界面不能等它：先改本地，再尽力发出去。
 *   2. 发失败的事件进 queue，下次进来补发。宁可晚到，不要丢。
 *   3. GET 只做合并，不做渲染触发的等待——星图不因为后端慢而空着。
 */

var NL_NET = {
  rev: 0,
  state: null,
  online: null,   /* null=还没试过, true/false */
  queue: []
};

var NL_QUEUE_KEY = 'neuroloop.queue';
var NL_STATE_URL = '/neuroloop/state';
var NL_EVENT_URL = '/neuroloop/event';

function nlQueueLoad() {
  try {
    var raw = window.localStorage.getItem(NL_QUEUE_KEY);
    var arr = raw ? JSON.parse(raw) : [];
    NL_NET.queue = Array.isArray(arr) ? arr.slice(-100) : [];
  } catch (e) {
    NL_NET.queue = [];
  }
}
function nlQueueSave() {
  try {
    window.localStorage.setItem(NL_QUEUE_KEY, JSON.stringify(NL_NET.queue.slice(-100)));
  } catch (e) { /* noop */ }
}
function nlQueuePush(ev) {
  NL_NET.queue.push(ev);
  nlQueueSave();
}

function nlCanFetch() {
  return typeof fetch === 'function';
}

/* 发一条事件。失败就进队列，不抛、不阻塞界面。 */
function nlPost(ev, done) {
  if (!nlCanFetch()) {
    nlQueuePush(ev);
    if (done) done(false);
    return;
  }
  var body = JSON.stringify(ev);
  fetch(NL_EVENT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body
  }).then(function (r) {
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }).then(function (j) {
    NL_NET.online = true;
    if (j && typeof j.rev === 'number') NL_NET.rev = j.rev;
    if (j && j.state) nlMergeState(j.state);
    if (done) done(true);
  }).catch(function () {
    NL_NET.online = false;
    nlQueuePush(ev);
    if (done) done(false);
  });
}

/* 把队列里的补发掉；成功一条就移一条。 */
function nlFlush() {
  if (!NL_NET.queue.length || !nlCanFetch()) return;
  var batch = NL_NET.queue.slice(0);
  NL_NET.queue = [];
  nlQueueSave();
  var i = 0;
  (function next() {
    if (i >= batch.length) return;
    var ev = batch[i++];
    nlPost(ev, function () { next(); });
  })();
}

/* 合并宿主投影：磨平过的碎片、每个考点的真实命中率与到期日。 */
function nlMergeState(st) {
  if (!st || typeof st !== 'object') return;
  NL_NET.state = st;
  if (typeof st.rev === 'number') NL_NET.rev = st.rev;

  if (Array.isArray(st.flattened)) {
    var seen = {};
    for (var i = 0; i < STORE.flattened.length; i++) seen[STORE.flattened[i]] = 1;
    var added = 0;
    for (var j = 0; j < st.flattened.length; j++) {
      var key = st.flattened[j];
      if (!seen[key]) { STORE.flattened.push(key); added++; }
    }
    if (added) saveStore();
  }

  if (st.nodes) nlApplyNodes(st.nodes);
}

/* 事件算出来的数字盖在 seed 的静态数字上——有实测就用实测。 */
function nlApplyNodes(nodes) {
  for (var sid in BY_SUBJECT) {
    if (!Object.prototype.hasOwnProperty.call(BY_SUBJECT, sid)) continue;
    var sub = BY_SUBJECT[sid];
    var ns = sub.nodes || [];
    for (var i = 0; i < ns.length; i++) {
      var nd = ns[i];
      var live = nodes[nd.id];
      if (!live) continue;
      nd.live = live;
      if (typeof live.hitRate === 'number') nd.hit = live.hitRate;
      if (typeof live.dueAt === 'string') nd.dueAt = live.dueAt;
      if (typeof live.streak === 'number') nd.streak = live.streak;
    }
  }
}

/* 启动时拉一次。失败就把 online 置 false，界面照常跑。 */
function nlSync(done) {
  if (!nlCanFetch()) {
    NL_NET.online = false;
    if (done) done(false);
    return;
  }
  fetch(NL_STATE_URL, { headers: { accept: 'application/json' } })
    .then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    })
    .then(function (j) {
      NL_NET.online = true;
      if (j && j.state) nlMergeState(j.state);
      if (done) done(true);
    })
    .catch(function () {
      NL_NET.online = false;
      if (done) done(false);
    });
}

/* ── 调度 ────────────────────────────────────────────────────────────────────
 * 到期日由宿主算（它看得到全部历史），这里只负责读和显示。
 * 上限 5：一天要判的量必须小到"不判完不甘心"，大到"明天还愿意来"。
 */

var NL_DUE_CAP = 5;

function nlDueNodes(sid) {
  var sub = BY_SUBJECT[sid] || {};
  var ns = sub.nodes || [];
  var now = Date.now();
  var out = [];
  for (var i = 0; i < ns.length; i++) {
    var nd = ns[i];
    if (!nd.dueAt) continue;
    var due = Date.parse(nd.dueAt);
    if (!isFinite(due) || due > now) continue;
    out.push(nd);
  }
  out.sort(function (a, b) { return Date.parse(a.dueAt) - Date.parse(b.dueAt); });
  return out;
}

function nlDueCount(sid) {
  return nlDueNodes(sid).length;
}

/* 「在 3 天后」/「逾期 2 天」/「未排期」——不写日期，写距离。 */
function nlDueText(nd) {
  if (!nd || !nd.dueAt) return '未排期';
  var due = Date.parse(nd.dueAt);
  if (!isFinite(due)) return '未排期';
  var days = (due - Date.now()) / 86400000;
  if (days < 0) return '逾期 ' + Math.max(1, Math.ceil(-days)) + ' 天';
  if (days < 1) return '今天之内';
  return '在 ' + Math.ceil(days) + ' 天后';
}

/* 记一次回忆判定。本地先动（卡片立刻变），再尽力发出去。 */
function nlRecordRecall(nd, ok) {
  if (!nd || !nd.id) return;
  var live = nd.live || (nd.live = { hits: 0, misses: 0, streak: 0 });
  if (ok) {
    live.hits += 1;
    live.streak = (live.streak || 0) + 1;
  } else {
    live.misses += 1;
    live.streak = 0;
  }
  var total = live.hits + live.misses;
  live.hitRate = total ? live.hits / total : null;
  nd.hit = live.hitRate;
  nd.streak = live.streak;
  var days = ok ? Math.min(45, Math.pow(2, Math.max(0, nd.streak - 1))) : 1 / 3;
  nd.dueAt = new Date(Date.now() + days * 86400000).toISOString();
  live.dueAt = nd.dueAt;
  nlPost({ kind: 'recall', node: nd.id, ok: ok ? 1 : 0 });
}
