// 宿主半边的无头测试（L2）。不启动 HTTP 服务器：直接调 apply() 拿路由，
// 用假 req/res 走完整链路，落盘到临时目录。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-host-'))
process.env.NEUROLOOP_HOME = HOME

const { apply, inject, resetCache, ROUTE_STATE, ROUTE_EVENT, ROUTE_MAIL, ROUTE_TODAY } = await import('../index.js')

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
ok(routes.length === 4, '注册了 4 条路由（实际 ' + routes.length + '）')
ok(routes.some((r) => r.path === ROUTE_STATE && r.kind === 'exact'), 'GET 路由 ' + ROUTE_STATE)
ok(routes.some((r) => r.path === ROUTE_EVENT && r.kind === 'exact'), 'POST 路由 ' + ROUTE_EVENT)
ok(routes.some((r) => r.path === ROUTE_MAIL && r.kind === 'exact'), 'POST 路由 ' + ROUTE_MAIL)
ok(routes.some((r) => r.path === ROUTE_TODAY && r.kind === 'exact'), 'GET 路由 ' + ROUTE_TODAY)

const getState = routes.find((r) => r.path === ROUTE_STATE).handler
const postEvent = routes.find((r) => r.path === ROUTE_EVENT).handler
const onMail = routes.find((r) => r.path === ROUTE_MAIL).handler
const onToday = routes.find((r) => r.path === ROUTE_TODAY).handler

// 1. 空态
{
  const r = await call(getState, makeReq())
  ok(r.status === 200, 'GET state 200')
  ok(r.json && r.json.ok === true && r.json.state.version === 1, 'state 带 version=1')
  ok(Object.keys(r.json.state.nodes).length === 0, '空库 nodes 为空')
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
  ok(lines.length === 1 && JSON.parse(lines[0]).k === 'recall', 'L1 一行一个事件')
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

console.log('\nhost ok — ' + pass + ' checks, routes 4, home ' + HOME)
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

process.exit(process.exitCode || 0)
