// 宿主半边的无头测试（L2）。不启动 HTTP 服务器：直接调 apply() 拿路由，
// 用假 req/res 走完整链路，落盘到临时目录。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-host-'))
process.env.NEUROLOOP_HOME = HOME
process.env.NEUROLOOP_TEAM_ROOT = HOME
process.env.NEUROLOOP_BUS_ROOT = HOME  // 台账也写到临时目录，别污染仓库

const { apply, inject, resetCache, ROUTE_STATE, ROUTE_EVENT, ROUTE_EVENTS, ROUTE_MAIL, ROUTE_TODAY, ROUTE_TEAM, ROUTE_BUS } = await import('../index.js')

let pass = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('  FAIL  ' + msg)
    process.exitCode = 1
    throw new Error(msg)
  }
  pass++
  console.log('  ok    ' + msg)
}

function makeReq(opts = {}) {
  const { method = 'GET', headers = {}, body = '', remote = '127.0.0.1', host = '127.0.0.1:62401', url = '/' } = opts
  const listeners = {}
  const req = {
    method,
    url,
    headers: Object.assign({ host }, headers),
    socket: { remoteAddress: remote },
    destroy() {},
    on(ev, cb) {
      ;(listeners[ev] || (listeners[ev] = [])).push(cb)
      return req
    },
  }
  const emit = (ev, arg) => {
    for (const cb of listeners[ev] || []) cb(arg)
  }
  setImmediate(() => {
    if (body) emit('data', Buffer.from(body))
    emit('end')
  })
  return req
}

function makeRes() {
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) {
      this.headers[String(k).toLowerCase()] = v
    },
    end(b) {
      this.body = b == null ? '' : String(b)
      if (this._done) this._done()
    },
  }
  return res
}

function call(handler, req) {
  const res = makeRes()
  return new Promise((resolve) => {
    res._done = () => resolve({ status: res.statusCode, json: safeJson(res.body), res })
    Promise.resolve(handler(req, res)).catch((err) => {
      console.error('  handler threw: ' + (err && err.message))
      resolve({ status: 500, json: null })
    })
  })
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// —— 捕获路由 ——
const routes = []
let cleaned = false
const ctx = {
  get: () => null,
  logger: { warn() {} },
  webServer: {
    register(route) {
      routes.push(route)
      return () => {}
    },
  },
  effect(fn) {
    const dispose = fn()
    return () => {
      if (typeof dispose === 'function') dispose()
      cleaned = true
    }
  },
}

console.log('host: ' + HOME)

apply(ctx)

/* 依赖 webServer 必须用数组写法：{ optional: [...] } 会被 loader 当成"等一个叫 optional 的服务"，
 * 插件永远 pending，路由整块不存在（14:35 实际踩过）。 */
ok(Array.isArray(inject) && inject.includes('webServer'), 'inject 以数组声明依赖 webServer')
ok(!(inject && !Array.isArray(inject) && inject.optional), 'inject 不得使用 { optional } 写法（会永久 pending）')
ok(routes.length === 7, '注册了 7 条路由（实际 ' + routes.length + '）')
ok(routes.some((r) => r.path === ROUTE_STATE && r.kind === 'exact'), 'GET 路由 ' + ROUTE_STATE)
ok(routes.some((r) => r.path === ROUTE_EVENT && r.kind === 'exact'), 'POST 路由 ' + ROUTE_EVENT)
ok(routes.some((r) => r.path === ROUTE_EVENTS && r.kind === 'exact'), 'POST 路由 ' + ROUTE_EVENTS)
ok(routes.some((r) => r.path === ROUTE_MAIL && r.kind === 'exact'), 'POST 路由 ' + ROUTE_MAIL)
ok(routes.some((r) => r.path === ROUTE_TODAY && r.kind === 'exact'), 'GET 路由 ' + ROUTE_TODAY)

/* 路由表快照：路径、种类、顺序一起钉死。
 * 拆分 index.js 时这张表必须一字不差地保留；以后增删路由要显式改这里，不能悄悄变。 */
const ROUTE_TABLE = [
  { path: '/neuroloop/state', kind: 'exact' },
  { path: '/neuroloop/event', kind: 'exact' },
  { path: '/neuroloop/events', kind: 'exact' },
  { path: '/neuroloop/mail', kind: 'exact' },
  { path: '/neuroloop/today', kind: 'exact' },
  { path: '/neuroloop/team', kind: 'exact' },
  { path: '/neuroloop/bus', kind: 'exact' },
]
ok(
  JSON.stringify(routes.map((r) => ({ path: r.path, kind: r.kind }))) === JSON.stringify(ROUTE_TABLE),
  '路由表快照：7 条路径、kind 与注册顺序不变',
)

const getState = routes.find((r) => r.path === ROUTE_STATE).handler
const postEvent = routes.find((r) => r.path === ROUTE_EVENT).handler
const postEvents = routes.find((r) => r.path === ROUTE_EVENTS).handler
const onMail = routes.find((r) => r.path === ROUTE_MAIL).handler
const onToday = routes.find((r) => r.path === ROUTE_TODAY).handler

// 1. 空态
{
  const r = await call(getState, makeReq())
  ok(r.status === 200, 'GET state 200')
  ok(r.json && r.json.ok === true && r.json.state.version === 2, 'state 带 version=2')
  ok(Object.keys(r.json.state.nodes).length === 0, '空库 nodes 为空')
  ok(r.json.data && r.json.data.state && r.json.data.state.version === 2, '成功外壳：data.state 携带投影')
  ok(Number.isInteger(r.json.rev) && r.json.rev === r.json.state.rev, '成功外壳：rev = 州事件条数')
}

// 2. 写一条 recall
{
  const body = JSON.stringify({ kind: 'recall', node: 'math.deriv', ok: 1 })
  const r = await call(postEvent, makeReq({ method: 'POST', body, headers: { 'content-type': 'application/json' } }))
  ok(r.status === 200, 'POST recall 200')
  ok(r.json.ok === true && r.json.rev === 1, 'rev 递增到 1')
  const n = r.json.state.nodes['math.deriv']
  ok(n && n.hits === 1 && n.streak === 1, 'hits/streak = 1')
  ok(n.hitRate === 1 && typeof n.dueAt === 'string', 'hitRate=1 且有 dueAt')
  ok(Date.parse(n.dueAt) > Date.now(), 'dueAt 在未来')
}

// 3. 落盘
{
  const file = path.join(HOME, 'state.json')
  ok(fs.existsSync(file), 'state.json 已落盘')
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  ok(parsed.nodes['math.deriv'].hits === 1, '落盘内容正确')
  ok(!fs.existsSync(file + '.tmp'), '没有残留 .tmp')
  const ev = fs.readdirSync(HOME).filter((f) => f.startsWith('events-'))
  ok(ev.length === 1, 'L1 按月一个文件（' + ev.join(',') + '）')
  const lines = fs.readFileSync(path.join(HOME, ev[0]), 'utf8').trim().split('\n')
  ok(lines.length === 1 && JSON.parse(lines[0]).v === 2 && JSON.parse(lines[0]).kind === 'attempt', 'L1 一行一个 v2 事件')
}

// 4. 错的要拒
{
  const bad = await call(postEvent, makeReq({ method: 'POST', body: JSON.stringify({ kind: 'drop-database' }) }))
  ok(bad.status === 400 && bad.json.error === 'bad-kind', '未知 kind → 400 bad-kind')

  const badNode = await call(postEvent, makeReq({ method: 'POST', body: JSON.stringify({ kind: 'recall', node: 'Math Deriv', ok: 1 }) }))
  ok(badNode.status === 400 && badNode.json.error === 'bad-node', '非法 node → 400 bad-node')

  const badJson = await call(postEvent, makeReq({ method: 'POST', body: '{oops' }))
  ok(badJson.status === 400 && badJson.json.error === 'bad-json', '坏 JSON → 400 bad-json')

  const wrongOrigin = await call(
    postEvent,
    makeReq({ method: 'POST', body: JSON.stringify({ kind: 'recall', node: 'math.deriv', ok: 1 }), headers: { origin: 'https://evil.example' } }),
  )
  ok(wrongOrigin.status === 403 && wrongOrigin.json.error === 'origin-mismatch', '跨源 → 403')

  const remote = await call(postEvent, makeReq({ method: 'POST', body: '{}', remote: '10.0.0.9' }))
  ok(remote.status === 403 && remote.json.error === 'not-loopback', '非本机 → 403')

  const method = await call(postEvent, makeReq({ method: 'GET' }))
  ok(method.status === 405, 'GET 写路由 → 405')
}

// 5. 磨平 / 撤销
{
  const flat = await call(postEvent, makeReq({ method: 'POST', body: JSON.stringify({ kind: 'flatten', shard: 'shard:chem.eq:3' }) }))
  ok(flat.status === 200 && flat.json.state.flattened.includes('shard:chem.eq:3'), 'flatten 进投影')
  const un = await call(postEvent, makeReq({ method: 'POST', body: JSON.stringify({ kind: 'unflatten', shard: 'shard:chem.eq:3' }) }))
  ok(un.status === 200 && un.json.state.flattened.length === 0, 'unflatten 撤销（追加而非删除）')

  // daily：每日一页回填
  const badDate = await call(postEvent, makeReq({ method: 'POST', body: JSON.stringify({ kind: 'daily', date: '11-10', subject: 'politics' }) }))
  ok(badDate.status === 400 && badDate.json.error === 'bad-date', 'daily 拒收坏日期')
  const badMin = await call(postEvent, makeReq({ method: 'POST', body: JSON.stringify({ kind: 'daily', date: '2026-11-10', subject: 'politics', minutes: 9999 }) }))
  ok(badMin.status === 400 && badMin.json.error === 'bad-minutes', 'daily 拒收离谱用时')
  const badWrong = await call(postEvent, makeReq({ method: 'POST', body: JSON.stringify({ kind: 'daily', date: '2026-11-10', subject: 'politics', wrong: ['x'] }) }))
  ok(badWrong.status === 400 && badWrong.json.error === 'bad-wrong', 'daily 拒收非数字错号')
  const daily = await call(postEvent, makeReq({ method: 'POST', body: JSON.stringify({
    kind: 'daily', date: '2026-11-10', subject: 'politics', minutes: 25,
    wrong: [3, 5], blocked: '实践与认识的先后关系', note: '教参 P.48-49',
  }) }))
  ok(daily.status === 200, 'daily 写入 200')
  const drec = daily.json.state.daily['2026-11-10'].politics
  ok(drec.minutes === 25 && drec.wrong.join(',') === '3,5', 'daily 投影字段齐')
  ok(drec.blocked.includes('实践'), 'daily 保留卡点原文')
  const daily2 = await call(postEvent, makeReq({ method: 'POST', body: JSON.stringify({ kind: 'daily', date: '2026-11-10', subject: 'math', minutes: 40 }) }))
  ok(daily2.json.state.daily['2026-11-10'].politics && daily2.json.state.daily['2026-11-10'].math, '同一天多科并存')

}

// 6. L2 丢了能重建
{
  fs.rmSync(path.join(HOME, 'state.json'))
  resetCache()
  const r = await call(getState, makeReq())
  ok(r.status === 200 && r.json.state.nodes['math.deriv'].hits === 1, '删掉 state.json 后从 L1 重建')
  ok(fs.existsSync(path.join(HOME, 'state.json')), '重建后写回 state.json')
}

// 7. 坏行不炸（坏行只有在重建扫描时才会被发现，缓存命中时不重扫 L1）
{
  const ev = fs.readdirSync(HOME).filter((f) => f.startsWith('events-'))[0]
  fs.appendFileSync(path.join(HOME, ev), '{"t":"oops"\n', 'utf8')
  fs.rmSync(path.join(HOME, 'state.json'))
  resetCache()
  const r = await call(getState, makeReq())
  ok(r.status === 200, 'L1 里混入坏行仍能读')
  ok(r.json.state.badLines >= 1, '重建时坏行被计数（badLines=' + r.json.state.badLines + '）')
  ok(r.json.state.nodes['math.deriv'].hits === 1, '坏行不影响好行')
}

// 8. 信箱：寄 / 读 / 标已读 / 守卫
{
  const s = await call(onMail, makeReq({
    method: 'POST', url: ROUTE_MAIL,
    body: JSON.stringify({ to: 'lead', from: 'moya', subject: '转交', body: '用户想改英语页' }),
  }))
  ok(s.status === 200 && s.json.ok && s.json.letter.id, 'POST mail 200 且带回信 id')

  const g = await call(onMail, makeReq({ url: ROUTE_MAIL + '?to=lead&unread=1' }))
  ok(g.status === 200 && g.json.letters.length === 1, 'GET mail 读到 1 封未读')
  ok(g.json.letters[0].unread === true && g.json.letters[0].from === 'moya', '未读标记与发件人正确')

  const rid = g.json.letters[0].id
  const m = await call(onMail, makeReq({
    method: 'POST', url: ROUTE_MAIL + '?read=1', body: JSON.stringify({ to: 'lead', ids: [rid] }),
  }))
  ok(m.status === 200 && m.json.ok, 'POST ?read=1 标记已读')
  const g2 = await call(onMail, makeReq({ url: ROUTE_MAIL + '?to=lead&unread=1' }))
  ok(g2.json.letters.length === 0, '已读后未读列表为空')

  const badTo = await call(onMail, makeReq({ url: ROUTE_MAIL + '?to=BAD NAME' }))
  ok(badTo.status === 400 && badTo.json.error === 'bad-to', '信箱拒绝非法收件人名')

  const badBody = await call(onMail, makeReq({
    method: 'POST', url: ROUTE_MAIL, body: JSON.stringify({ to: 'lead', from: 'moya', body: '' }),
  }))
  ok(badBody.status === 400, '信箱拒绝空正文')

  const cross = await call(onMail, makeReq({
    method: 'POST', url: ROUTE_MAIL,
    headers: { origin: 'http://evil.example' },
    body: JSON.stringify({ to: 'lead', from: 'x', body: 'hi' }),
  }))
  ok(cross.status === 403, '信箱拒绝跨源写入')
}

console.log('\nhost ok — ' + pass + ' checks, routes 5, home ' + HOME)
/* ---------- 今天（/neuroloop/today） ---------- */
{
  const day = await call(onToday, makeReq({ url: ROUTE_TODAY + '?date=2026-11-10' }))
  ok(day.status === 200 && day.json.ok, '今天：200')
  const t = day.json.today || {}
  ok(t.date === '2026-11-10', '今天：日期回显')
  ok(t.dayNo === 2, '今天：排程第 2 天（实际 ' + t.dayNo + '）')
  ok(t.politics && t.politics.book === '必修四' && t.politics.from === 67, '今天：政治取到 4.2 的页范围')
  ok(t.english && t.english.from === 21 && t.english.count === 20, '今天：英语第 2 天 21–40')
  ok(Array.isArray(t.tasks) && t.tasks.length === 3, '今天：数理化各一行任务（实际 ' + (t.tasks || []).length + '）')
  ok(t.papers && t.papers.politics && 'pdf' in t.papers.politics, '今天：带两张纸的状态')
  ok(t.progress && typeof t.progress.dueTotal === 'number', '今天：带到期统计')

  const badDay = await call(onToday, makeReq({ url: ROUTE_TODAY + '?date=11-10' }))
  ok(badDay.status === 400 && badDay.json.error === 'bad-date', '今天：拒绝非法日期')

  const wrongMethod = await call(onToday, makeReq({ method: 'POST', url: ROUTE_TODAY }))
  ok(wrongMethod.status === 405, '今天：只接受 GET')
}

/* ---------- 维护台账（/neuroloop/team） ---------- */
{
  const g = routes.find((r) => r.path === ROUTE_TEAM).handler
  const empty = await call(g, makeReq({ url: ROUTE_TEAM }))
  ok(empty.status === 200 && empty.json.ok && empty.json.counts.total === 0, '团队：空台账可读')
  ok(Array.isArray(empty.json.roles) && empty.json.roles.length >= 5, '团队：带角色契约')

  const a = await call(g, makeReq({ method: 'POST', url: ROUTE_TEAM, body: JSON.stringify({
    title: 'storage：SQLite 投影', role: 'core-dev', scope: ['storage/'],
    accept: ['node --test test/storage.test.mjs 全绿'],
  }) }))
  ok(a.status === 200 && /^T-\d{4}$/.test(a.json.ticket.id), '团队：开票成功 ' + (a.json.ticket && a.json.ticket.id))
  const id = a.json.ticket.id
  ok(a.json.ticket.status === 'ready' && a.json.ticket.claimable === true, '团队：新票可领')

  const b = await call(g, makeReq({ method: 'POST', url: ROUTE_TEAM, body: JSON.stringify({
    title: '依赖票', role: 'qa', deps: [id],
  }) }))
  ok(b.json.ticket.claimable === false && b.json.ticket.depsOpen[0] === id, '团队：依赖未完成不可领')
  const early = await call(g, makeReq({ method: 'POST', url: ROUTE_TEAM, body: JSON.stringify({ id: b.json.ticket.id, action: 'claim', by: 'qa' }) }))
  ok(early.status === 400 && early.json.error === 'deps-open', '团队：抢跑被拒 deps-open')

  const c = await call(g, makeReq({ method: 'POST', url: ROUTE_TEAM, body: JSON.stringify({ id, action: 'claim', by: 'lead' }) }))
  ok(c.status === 200 && c.json.ticket.status === 'claimed' && c.json.ticket.by === 'lead', '团队：领票成功')

  const twice = await call(g, makeReq({ method: 'POST', url: ROUTE_TEAM, body: JSON.stringify({ id, action: 'claim', by: 'qa' }) }))
  ok(twice.status === 400 && twice.json.error === 'already-claimed', '团队：同一票不能重复领')

  const blk = await call(g, makeReq({ method: 'POST', url: ROUTE_TEAM, body: JSON.stringify({ id, action: 'block' }) }))
  ok(blk.status === 400 && blk.json.error === 'note-required', '团队：阻塞必须写原因')

  const done = await call(g, makeReq({ method: 'POST', url: ROUTE_TEAM, body: JSON.stringify({ id, action: 'complete', note: '8/8 通过' }) }))
  ok(done.status === 200 && done.json.ticket.status === 'done', '团队：完票')

  const after = await call(g, makeReq({ url: ROUTE_TEAM }))
  ok(after.json.counts.done === 1 && after.json.counts.total === 2, '团队：看板统计正确')
  ok(after.json.data && after.json.data.tickets.length === 2 && typeof after.json.rev === 'number', '团队：成功外壳 data/rev')
  const limited = await call(g, makeReq({ url: ROUTE_TEAM + '?limit=1' }))
  ok(limited.status === 200 && limited.json.tickets.length === 1, '团队：limit=1 裁剪 tickets')
  ok(limited.json.counts.total === 2 && limited.json.data.tickets.length === 1, '团队：裁剪只作用于列表，统计仍按全量')
  const badLimit = await call(g, makeReq({ url: ROUTE_TEAM + '?limit=0' }))
  ok(badLimit.status === 400 && badLimit.json.error === 'bad-limit', '团队：非法 limit → 400 bad-limit')
  const unlocked = after.json.tickets.find((t) => t.id === b.json.ticket.id)
  ok(unlocked.claimable === true, '团队：依赖完成后自动可领')

  const badRole = await call(g, makeReq({ method: 'POST', url: ROUTE_TEAM, body: JSON.stringify({ title: 'x', role: 'nobody' }) }))
  ok(badRole.status === 400 && badRole.json.error === 'bad-role', '团队：拒绝未知角色')
}

/* ---------- 总线（/neuroloop/bus） ---------- */
{
  const g = routes.find((r) => r.path === ROUTE_BUS).handler
  const empty = await call(g, makeReq({ url: ROUTE_BUS + '?to=lead' }))
  ok(empty.status === 200 && empty.json.ok && empty.json.msgs.length === 0, '总线：空总线可读')
  ok(empty.json.pending && empty.json.pending.sub === 0, '总线：带未读计数')

  const p = await call(g, makeReq({ method: 'POST', url: ROUTE_BUS, body: JSON.stringify({
    lane: 'sub', from: 'ui-agent', to: 'lead', text: 'T-0003 已交付', ref: 'T-0003',
  }) }))
  ok(p.status === 200 && /^[0-9a-z]{12}$/.test(p.json.msg.id), '总线：投递成功 ' + (p.json.msg && p.json.msg.id))
  ok(p.json.msg.lane === 'sub' && p.json.msg.ref === 'T-0003', '总线：lane 与 ref 保留')

  const got = await call(g, makeReq({ url: ROUTE_BUS + '?to=lead&limit=5' }))
  ok(got.json.msgs.length === 1 && got.json.msgs[0].text === 'T-0003 已交付', '总线：按收件人读回')
  ok(got.json.pending.sub === 1, '总线：未读 +1')
  ok(got.json.data && got.json.data.msgs.length === 1 && typeof got.json.rev === 'number', '总线：成功外壳 data/rev')

  const other = await call(g, makeReq({ url: ROUTE_BUS + '?to=nobody' }))
  ok(other.json.msgs.length === 0, '总线：收件人过滤生效')

  await call(g, makeReq({ method: 'POST', url: ROUTE_BUS, body: JSON.stringify({ lane: 'sub', from: 'ui-agent', to: 'lead', text: '第二条' }) }))
  await call(g, makeReq({ method: 'POST', url: ROUTE_BUS, body: JSON.stringify({ lane: 'note', from: 'lead', to: 'lead', text: '第三条' }) }))

  const all = await call(g, makeReq({ url: ROUTE_BUS + '?to=lead' }))
  ok(all.status === 200 && all.json.msgs.length === 3, '总线：缺省不裁剪（3 条全给）')

  const cut = await call(g, makeReq({ url: ROUTE_BUS + '?to=lead&limit=2' }))
  ok(cut.status === 200 && cut.json.msgs.length === 2 && cut.json.data.msgs.length === 2, '总线：limit=2 裁剪 msgs')

  const badLimit = await call(g, makeReq({ url: ROUTE_BUS + '?to=lead&limit=abc' }))
  ok(badLimit.status === 400 && badLimit.json.error === 'bad-limit', '总线：非法 limit → 400 bad-limit')
  const overLimit = await call(g, makeReq({ url: ROUTE_BUS + '?to=lead&limit=201' }))
  ok(overLimit.status === 400 && overLimit.json.error === 'bad-limit', '总线：limit 超上限 → 400 bad-limit')

  const badLane = await call(g, makeReq({ method: 'POST', url: ROUTE_BUS, body: JSON.stringify({ lane: 'nope', text: 'x' }) }))
  ok(badLane.status === 400 && badLane.json.error === 'bad-lane', '总线：拒绝未知 lane')

  const emptyText = await call(g, makeReq({ method: 'POST', url: ROUTE_BUS, body: JSON.stringify({ lane: 'note', text: '   ' }) }))
  ok(emptyText.status === 400 && emptyText.json.error === 'empty-text', '总线：拒绝空正文')

  const wrong = await call(g, makeReq({ method: 'PUT', url: ROUTE_BUS }))
  ok(wrong.status === 405, '总线：只接受 GET/POST')
}

/* ---------- 批量导入（/neuroloop/events） ---------- */
{
  // 200 条全部合法：accepted=200，ids 与 rev 都对得上。
  const batch = []
  for (let i = 0; i < 200; i += 1) batch.push({ kind: 'recall', node: 'math.batch' + i, ok: 1 })
  const before = await call(getState, makeReq())
  const r = await call(postEvents, makeReq({
    method: 'POST', url: ROUTE_EVENTS, body: JSON.stringify({ events: batch }),
  }))
  ok(r.status === 200 && r.json.ok === true, '批量：200 条 → 200')
  ok(r.json.accepted === 200 && r.json.rejected.length === 0, '批量：200 条全部接受（rejected 为空）')
  ok(Array.isArray(r.json.ids) && r.json.ids.length === 200, '批量：返回 200 个 eventId')
  ok(r.json.ids.every((id) => /^[0-9a-f]{12}$/.test(id)), '批量：id 是 core 派生的 12 位短 id')
  ok(r.json.rev === before.json.rev + 200, '批量：rev = 原 rev + 200（' + r.json.rev + '）')
  ok((await call(getState, makeReq())).json.state.nodes['math.batch199'].hits === 1, '批量：第 200 条也进了投影')

  // 201 条：整批 400，一条都不写。
  const over = batch.concat([{ kind: 'recall', node: 'math.overflow', ok: 1 }])
  const beforeOver = await call(getState, makeReq())
  const big = await call(postEvents, makeReq({
    method: 'POST', url: ROUTE_EVENTS, body: JSON.stringify({ events: over }),
  }))
  ok(big.status === 400 && big.json.error === 'batch-too-large', '批量：201 条 → 400 batch-too-large')
  const afterOver = await call(getState, makeReq())
  ok(afterOver.json.rev === beforeOver.json.rev && !afterOver.json.state.nodes['math.overflow'],
    '批量：超上限一条都没写入')

  // 3 条里 1 条非法（下标 1）：部分成功，rejected 带原始下标与 core 的错误码。
  const mixed = [
    { kind: 'recall', node: 'math.mix0', ok: 1 },
    { kind: 'recall', node: 'Bad Node', ok: 1 },
    { kind: 'daily', date: '2026-11-11', subject: 'math', minutes: 30 },
  ]
  const m = await call(postEvents, makeReq({
    method: 'POST', url: ROUTE_EVENTS, body: JSON.stringify({ events: mixed }),
  }))
  ok(m.status === 200 && m.json.accepted === 2, '批量：3 条里 1 条非法 → accepted:2')
  ok(m.json.rejected.length === 1 && m.json.rejected[0].index === 1, '批量：rejected[0].index === 1')
  ok(m.json.rejected[0].error === 'bad-node', '批量：rejected 用 core 的错误码 bad-node')
  ok(m.json.ids.length === 2, '批量：ids 只含被接受的两条')
  const afterMixed = await call(getState, makeReq())
  ok(afterMixed.json.state.nodes['math.mix0'].hits === 1
    && afterMixed.json.state.daily['2026-11-11'].math.minutes === 30, '批量：合法两条都写入')

  // 裸数组也收。
  const bare = await call(postEvents, makeReq({
    method: 'POST', url: ROUTE_EVENTS, body: JSON.stringify([{ kind: 'recall', node: 'math.bare', ok: 0 }]),
  }))
  ok(bare.status === 200 && bare.json.accepted === 1 && bare.json.ids.length === 1, '批量：裸数组也收')
  // 只断言"进了投影"：v1 的 ok:0 → hit/miss 由 storage/legacy.js 决定，不在这条测试的语义里。
  ok((await call(getState, makeReq())).json.state.nodes['math.bare'].attempts === 1, '批量：裸数组那条进了投影')

  // 全部被拒：仍是 200，accepted:0，三条各回自己的错误码。
  const badAll = [
    { kind: 'recall', node: 'Bad Node', ok: 1 },
    { kind: 'daily', date: '11-10', subject: 'politics' },
    { kind: 'drop-database' },
  ]
  const all = await call(postEvents, makeReq({
    method: 'POST', url: ROUTE_EVENTS, body: JSON.stringify({ events: badAll }),
  }))
  ok(all.status === 200 && all.json.accepted === 0 && all.json.ids.length === 0, '批量：全部非法仍 200（accepted:0）')
  ok(all.json.rejected.map((x) => x.error).join(',') === 'bad-node,bad-date,bad-kind',
    '批量：三条各回自己的错误码（' + all.json.rejected.map((x) => x.error).join(',') + '）')
  ok(all.json.rejected.map((x) => x.index).join(',') === '0,1,2', '批量：rejected 下标逐条对应')
  ok(typeof all.json.rev === 'number', '批量：全拒时仍回报 rev')

  // 非对象条目：逐条拒，不连累整批，也不会 500。
  const nonObj = await call(postEvents, makeReq({
    method: 'POST', url: ROUTE_EVENTS, body: JSON.stringify([1, 'x', null]),
  }))
  ok(nonObj.status === 200 && nonObj.json.accepted === 0 && nonObj.json.rejected.length === 3,
    '批量：非对象条目逐条进 rejected')

  // 空批：200 且什么都不写。
  const emptyBatch = await call(postEvents, makeReq({
    method: 'POST', url: ROUTE_EVENTS, body: JSON.stringify({ events: [] }),
  }))
  ok(emptyBatch.status === 200 && emptyBatch.json.accepted === 0 && emptyBatch.json.rejected.length === 0,
    '批量：空数组 → 200 accepted:0')

  // 只有"请求体形状不对"才 400。
  const badJson = await call(postEvents, makeReq({ method: 'POST', url: ROUTE_EVENTS, body: '{oops' }))
  ok(badJson.status === 400 && badJson.json.error === 'bad-json', '批量：坏 JSON → 400 bad-json')
  const noList = await call(postEvents, makeReq({
    method: 'POST', url: ROUTE_EVENTS, body: JSON.stringify({ kind: 'recall', node: 'math.x', ok: 1 }),
  }))
  ok(noList.status === 400 && noList.json.error === 'bad-shape', '批量：既非数组也没有 events → 400 bad-shape')
  const notArray = await call(postEvents, makeReq({
    method: 'POST', url: ROUTE_EVENTS, body: JSON.stringify({ events: 'nope' }),
  }))
  ok(notArray.status === 400 && notArray.json.error === 'bad-shape', '批量：events 不是数组 → 400 bad-shape')
  const scalar = await call(postEvents, makeReq({ method: 'POST', url: ROUTE_EVENTS, body: '42' }))
  ok(scalar.status === 400 && scalar.json.error === 'bad-shape', '批量：裸标量 → 400 bad-shape')

  // 守卫与单条路由一致。
  const method = await call(postEvents, makeReq({ method: 'GET', url: ROUTE_EVENTS }))
  ok(method.status === 405, '批量：只接受 POST')
  const cross = await call(postEvents, makeReq({
    method: 'POST', url: ROUTE_EVENTS,
    headers: { origin: 'https://evil.example' },
    body: JSON.stringify([{ kind: 'recall', node: 'math.x', ok: 1 }]),
  }))
  ok(cross.status === 403 && cross.json.error === 'origin-mismatch', '批量：跨源 → 403')
  const remote = await call(postEvents, makeReq({
    method: 'POST', url: ROUTE_EVENTS, remote: '10.0.0.9', body: JSON.stringify([]),
  }))
  ok(remote.status === 403 && remote.json.error === 'not-loopback', '批量：非本机 → 403')

  // 单条路由仍只收对象：批量参数没有泄漏到旧路径。
  const singleArray = await call(postEvent, makeReq({
    method: 'POST', url: ROUTE_EVENT,
    body: JSON.stringify([{ kind: 'recall', node: 'math.array', ok: 1 }]),
  }))
  ok(singleArray.status === 400 && singleArray.json.error === 'bad-shape', '单条路由仍拒裸数组（行为不变）')
}

/* —— 错误码快照 ——
 * 拆 index.js 之前先抓了一份错误码清单；这里是它的三道锁：
 * 1) 清单文件本身（42 个，顺序即快照）；
 * 2) 每个码仍在源码里以字面量出现（防止改名、拼接、动态生成）；
 * 3) 运行时电池：非法请求走一圈，status:code 集合必须与拆之前完全一致。 */
{
  const ERROR_CODES = [
    'already-claimed', 'bad-action', 'bad-body', 'bad-date', 'bad-from', 'bad-id', 'bad-json',
    'bad-kind', 'bad-lane', 'bad-limit', 'bad-minutes', 'bad-node', 'bad-ok', 'bad-role', 'bad-shape',
    'bad-shard', 'bad-subject', 'bad-tag', 'bad-title', 'bad-to', 'bad-wrong', 'batch-too-large',
    'board-failed', 'body-too-large', 'body-too-long', 'bus-failed', 'deps-open', 'empty-body',
    'empty-text', 'method-not-allowed', 'no-ticket', 'not-loopback', 'note-required', 'origin-mismatch',
    'read-error', 'read-failed', 'send-failed', 'state-failed', 'text-too-long', 'ticket-failed',
    'today-failed', 'write-failed',
  ]
  const snapshotUrl = new URL('../host/handlers/.error-codes.txt', import.meta.url)
  const onDisk = fs.readFileSync(snapshotUrl, 'utf8').trim().split(/\r?\n/)
  ok(
    onDisk.length === ERROR_CODES.length && onDisk.every((c, i) => c === ERROR_CODES[i]),
    '错误码快照：.error-codes.txt 与 42 个码逐行一致（实际 ' + onDisk.length + '）',
  )

  const codeFiles = ['../index.js', '../host/reply.js']
  for (const ent of fs.readdirSync(new URL('../host/', import.meta.url), { withFileTypes: true })) {
    if (ent.isFile() && ent.name.endsWith('.js')) codeFiles.push('../host/' + ent.name)
  }
  for (const ent of fs.readdirSync(new URL('../host/handlers/', import.meta.url), { withFileTypes: true })) {
    if (ent.isFile() && ent.name.endsWith('.js')) codeFiles.push('../host/handlers/' + ent.name)
  }
  let source = ''
  for (const rel of codeFiles) source += fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
  const missing = ERROR_CODES.filter((code) => !source.includes("'" + code + "'"))
  ok(missing.length === 0, '错误码快照：源码里仍能找到全部字面量（缺 ' + missing.join(',') + '）')

  // 电池全部是非法请求：405 / 403 / 400 都发生在落盘之前，不会改数据。
  const observed = new Set()
  const teamHandler = routes.find((r) => r.path === ROUTE_TEAM).handler
  const busHandler = routes.find((r) => r.path === ROUTE_BUS).handler
  const probe = async (handler, opts) => {
    const r = await call(handler, makeReq(opts))
    observed.add(r.status + ':' + (r.json && r.json.error))
  }
  await probe(getState, { method: 'POST' })
  await probe(getState, { headers: { origin: 'https://evil.example' } })
  await probe(getState, { remote: '10.0.0.9' })
  await probe(postEvent, { method: 'GET' })
  await probe(postEvent, { method: 'POST', body: '{oops' })
  await probe(postEvent, { method: 'POST', body: '' })
  await probe(postEvent, { method: 'POST', body: '42' })
  await probe(postEvent, { method: 'POST', body: '[]' })
  await probe(postEvent, { method: 'POST', body: JSON.stringify({ kind: 'drop-database' }) })
  await probe(postEvent, { method: 'POST', body: JSON.stringify({ kind: 'recall', node: 'Bad Node', ok: 1 }) })
  await probe(postEvent, { method: 'POST', body: JSON.stringify({ kind: 'recall', node: 'math.x', ok: 'yes' }) })
  await probe(postEvent, { method: 'POST', body: JSON.stringify({ kind: 'note', node: 'math.x', tag: 'zzz', text: 'x' }) })
  await probe(postEvent, {
    method: 'POST',
    body: JSON.stringify({ kind: 'note', node: 'math.x', text: 'x'.repeat(401) }),
  })
  await probe(postEvent, { method: 'POST', body: JSON.stringify({ kind: 'daily', date: '11-10', subject: 'politics' }) })
  await probe(postEvent, { method: 'POST', body: JSON.stringify({ kind: 'daily', date: '2026-11-10', subject: 'x' }) })
  await probe(postEvent, {
    method: 'POST',
    body: JSON.stringify({ kind: 'daily', date: '2026-11-10', subject: 'politics', minutes: 9999 }),
  })
  await probe(postEvent, {
    method: 'POST',
    body: JSON.stringify({ kind: 'daily', date: '2026-11-10', subject: 'politics', wrong: ['x'] }),
  })
  await probe(postEvent, { method: 'POST', body: JSON.stringify({ kind: 'flatten', shard: 'nope' }) })
  await probe(postEvent, {
    method: 'POST',
    body: JSON.stringify({ kind: 'note', node: 'math.x', text: 'x'.repeat(70 * 1024) }),
  })
  await probe(postEvents, { method: 'GET', url: ROUTE_EVENTS })
  await probe(postEvents, { method: 'POST', url: ROUTE_EVENTS, body: '{oops' })
  await probe(postEvents, {
    method: 'POST', url: ROUTE_EVENTS, body: JSON.stringify({ kind: 'recall', node: 'math.x', ok: 1 }),
  })
  await probe(postEvents, { method: 'POST', url: ROUTE_EVENTS, body: JSON.stringify({ events: 'nope' }) })
  await probe(postEvents, {
    method: 'POST',
    url: ROUTE_EVENTS,
    body: JSON.stringify(Array.from({ length: 201 }, (_, i) => ({ kind: 'recall', node: 'math.p' + i, ok: 1 }))),
  })
  await probe(postEvents, { method: 'POST', url: ROUTE_EVENTS, body: '42' })
  await probe(onMail, { url: ROUTE_MAIL + '?to=BAD%20NAME' })
  await probe(onMail, {
    method: 'POST', url: ROUTE_MAIL, body: JSON.stringify({ to: 'lead', from: 'moy a', subject: 's', body: 'b' }),
  })
  await probe(onMail, {
    method: 'POST', url: ROUTE_MAIL, body: JSON.stringify({ to: 'lead', from: 'im', subject: 's', body: '' }),
  })
  await probe(onMail, {
    method: 'POST',
    url: ROUTE_MAIL,
    body: JSON.stringify({ to: 'lead', from: 'im', subject: 's', body: 'x'.repeat(9000) }),
  })
  await probe(onMail, { method: 'PUT', url: ROUTE_MAIL })
  await probe(onToday, { method: 'POST', url: ROUTE_TODAY })
  await probe(onToday, { url: ROUTE_TODAY + '?date=11-10' })
  await probe(onToday, { url: ROUTE_TODAY, headers: { origin: 'https://evil.example' } })
  await probe(teamHandler, { url: ROUTE_TEAM + '?limit=0' })
  await probe(teamHandler, { url: ROUTE_TEAM + '?limit=abc' })
  await probe(teamHandler, { method: 'POST', url: ROUTE_TEAM, body: JSON.stringify({ role: 'qa' }) })
  await probe(teamHandler, {
    method: 'POST', url: ROUTE_TEAM, body: JSON.stringify({ title: 'x', role: 'nobody' }),
  })
  await probe(teamHandler, { method: 'PUT', url: ROUTE_TEAM })
  await probe(busHandler, { url: ROUTE_BUS + '?to=lead&limit=0' })
  await probe(busHandler, { url: ROUTE_BUS + '?to=lead&limit=abc' })
  await probe(busHandler, { url: ROUTE_BUS + '?to=lead&limit=201' })
  await probe(busHandler, { method: 'POST', url: ROUTE_BUS, body: JSON.stringify({ lane: 'nope', text: 'x' }) })
  await probe(busHandler, { method: 'POST', url: ROUTE_BUS, body: JSON.stringify({ lane: 'note', text: '   ' }) })
  await probe(busHandler, {
    method: 'POST', url: ROUTE_BUS, body: JSON.stringify({ lane: 'note', text: 'x'.repeat(4001) }),
  })
  await probe(busHandler, { method: 'PUT', url: ROUTE_BUS })

  const RUNTIME_SNAPSHOT = [
    '400:bad-body', '400:bad-date', '400:bad-from', '400:bad-json', '400:bad-kind', '400:bad-lane',
    '400:bad-limit', '400:bad-minutes', '400:bad-node', '400:bad-ok', '400:bad-role', '400:bad-shape',
    '400:bad-shard', '400:bad-subject', '400:bad-tag', '400:bad-title', '400:bad-to', '400:bad-wrong',
    '400:batch-too-large', '400:body-too-large', '400:body-too-long', '400:empty-body', '400:empty-text',
    '400:text-too-long', '403:not-loopback', '403:origin-mismatch', '405:method-not-allowed',
  ]
  const got = [...observed].sort()
  ok(
    JSON.stringify(got) === JSON.stringify(RUNTIME_SNAPSHOT),
    '错误码快照：运行时非法请求产出同样的 status:code 集合（实际 ' + got.join(' ') + '）',
  )
}

process.exit(process.exitCode || 0)
