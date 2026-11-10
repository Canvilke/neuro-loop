// Neuro-Loop 宿主半边（S1/S2）。
//
// 打包插件的客户端半边没有 host.call，所以前后端之间只有一条路：HTTP。
// 这里只负责两件事——读投影、写事件。视觉不在这里。
//
//   GET  /neuroloop/state    → 整个投影（客户端启动时合并）
//   POST /neuroloop/event    → 追加一条事件（recall | note | flatten | unflatten）
//   POST /neuroloop/events   → 批量导入（≤200 条，逐条校验，部分成功）

import { addEvent, getState, reset as resetService } from './host/service.js'
import { isLoopback, isSameOrigin, readJsonBody, writeJson } from './host/http.js'
import { normalizeEvent } from './host/event.js'
import { LIMITS } from './core/contract.js'
import { inbox, markRead, readAll, send as postalSend, isValidName } from './host/mail.js'
import { buildToday, isValidDate } from './host/today.js'
import { board as teamBoard, create as createTicket, readLedger, update as updateTicket } from './host/team.js'
import { post as busPost, pending as busPending, read as busRead, recent as busRecent } from './host/bus.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 仓库根目录：plan/ 与 daily/ 都在这下面。
const ROOT = path.dirname(fileURLToPath(import.meta.url))
const BUS_ROOT = process.env.NEUROLOOP_BUS_ROOT || ROOT

// 依赖 webServer：这个 profile 一定有它（页面就是它发的）。
// 不用 { optional: [...] } 的写法——当前 loader 会把键名当成服务名去等，
// 结果卡在 "waiting for service: optional"。
export const inject = ['webServer']

export const ROUTE_STATE = '/neuroloop/state'
export const ROUTE_EVENT = '/neuroloop/event'
export const ROUTE_EVENTS = '/neuroloop/events'
export const ROUTE_MAIL = '/neuroloop/mail'
export const ROUTE_TODAY = '/neuroloop/today'
export const ROUTE_TEAM = '/neuroloop/team'
export const ROUTE_BUS = '/neuroloop/bus'
// 台账默认跟着仓库走；测试用 NEUROLOOP_TEAM_ROOT 指到临时目录，避免污染真台账。
const TEAM_ROOT = process.env.NEUROLOOP_TEAM_ROOT || ROOT

function state() {
  return getState()
}

/** 测试用：丢掉内存里的库句柄，下次读会从 L1 重建投影。 */
export function resetCache() {
  resetService()
}

function blocked(req) {
  if (!isLoopback(req)) return 'not-loopback'
  if (!isSameOrigin(req)) return 'origin-mismatch'
  return null
}

// 成功响应统一外壳：{ ok:true, data, rev }。
// 旧客户端按顶层字段读（state / msgs / tickets / today ...），所以原载荷也平铺保留一份。
function envelope(payload, rev) {
  return { ok: true, rev, ...payload, data: payload }
}

const LIMIT_MAX = 200
// 批量导入的上限与 core 的 LIMITS 同一个数：超了整批拒，一条都不写。
const BATCH_MAX = LIMITS.batchMax

/**
 * 解析列表端点的 limit：缺省 → 不裁剪（null）；非法 → { ok:false, error:'bad-limit' }。
 * 只认 1..200 的十进制整数，避免 Number('') / '5.0' / '1e3' 这类含糊值过关。
 */
function parseLimit(url) {
  if (!url.searchParams.has('limit')) return { ok: true, limit: null }
  const text = url.searchParams.get('limit')
  if (!/^\d+$/.test(text)) return { ok: false, error: 'bad-limit' }
  const n = Number(text)
  if (!Number.isInteger(n) || n < 1 || n > LIMIT_MAX) return { ok: false, error: 'bad-limit' }
  return { ok: true, limit: n }
}

function onState(req, res) {
  if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
  const why = blocked(req)
  if (why) return writeJson(res, 403, { ok: false, error: why })
  try {
    const s = state()
    writeJson(res, 200, envelope({ state: s }, s.rev))
  } catch (err) {
    writeJson(res, 500, { ok: false, error: 'state-failed', detail: String(err && err.message) })
  }
}

async function onEvent(req, res) {
  if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
  const why = blocked(req)
  if (why) return writeJson(res, 403, { ok: false, error: why })

  const body = await readJsonBody(req)
  if (!body.ok) return writeJson(res, 400, { ok: false, error: body.code })

  const norm = normalizeEvent(body.value)
  if (!norm.ok) return writeJson(res, 400, { ok: false, error: norm.code })

  try {
    // 顺序要紧：先落 L1（真源），再改投影，再原子覆盖 state.json。
    const { state: s, event: stored } = addEvent(norm.event)
    writeJson(res, 200, envelope({ event: stored, state: s }, s.rev))
  } catch (err) {
    writeJson(res, 500, { ok: false, error: 'write-failed', detail: String(err && err.message) })
  }
}

/**
 * 批量导入：POST /neuroloop/events
 *
 * 与单条路由共用同一条链路（host/event.js 校验 → service.addEvent 落盘），
 * 所以"什么算合法事件"永远只有一个答案，不另写一份 append/投影逻辑。
 * 逐条校验、部分成功：一条非法只进 rejected，不连累整批；
 * 只有"请求体形状不对"和"超上限"才是整批 400。
 */
async function onEvents(req, res) {
  if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
  const why = blocked(req)
  if (why) return writeJson(res, 403, { ok: false, error: why })

  const body = await readJsonBody(req, { allowArray: true })
  if (!body.ok) return writeJson(res, 400, { ok: false, error: body.code })

  // 两种入参都收：{ events: [...] } 与裸数组。
  const list = Array.isArray(body.value) ? body.value : body.value.events
  if (!Array.isArray(list)) return writeJson(res, 400, { ok: false, error: 'bad-shape' })
  // 超上限先挡在磁盘外：一条都不写。
  if (list.length > BATCH_MAX) return writeJson(res, 400, { ok: false, error: 'batch-too-large' })

  const rejected = []
  const ids = []
  let rev = null
  for (let i = 0; i < list.length; i += 1) {
    const norm = normalizeEvent(list[i])
    if (!norm.ok) {
      rejected.push({ index: i, error: norm.code })
      continue
    }
    try {
      // 唯一写路径：与单条路由完全一样的 addEvent。
      const { state: s, event: stored } = addEvent(norm.event)
      ids.push(stored.id)
      rev = s.rev
    } catch (err) {
      // core 的 DomainError 原样带 code（bad-concept / bad-text ...），不新造含糊字符串。
      if (err && typeof err.code === 'string') {
        rejected.push({ index: i, error: err.code })
        continue
      }
      return writeJson(res, 500, { ok: false, error: 'write-failed', detail: String(err && err.message) })
    }
  }

  // 全被拒时也要回报 rev（没写过就取当前投影的）。
  writeJson(res, 200, { ok: true, accepted: ids.length, rejected, ids, rev: rev === null ? state().rev : rev })
}

// 信箱：跨会话投递。GET 取信、POST 寄信、POST ?read=1 标记已读。
// 有意的限制：只接受本机同源请求——信件里可能写作业内容，不该被网页上的任意站点读走。
async function onMail(req, res) {
  const why = blocked(req)
  if (why) return writeJson(res, 403, { ok: false, error: why })

  const url = new URL(req.url, 'http://127.0.0.1')

  if (req.method === 'GET') {
    const box = url.searchParams.get('to') || ''
    if (!isValidName(box)) return writeJson(res, 400, { ok: false, error: 'bad-to' })
    const unreadOnly = url.searchParams.get('unread') === '1'
    const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100)
    try {
      const letters = inbox(box, { unreadOnly, limit })
      writeJson(res, 200, envelope({ to: box, letters }, readAll(box).length))
    } catch (err) {
      writeJson(res, 500, { ok: false, error: 'read-failed', detail: String(err && err.message) })
    }
    return
  }

  if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })

  const body = await readJsonBody(req)
  if (!body.ok) return writeJson(res, 400, { ok: false, error: body.code })
  const v = body.value

  try {
    if (url.searchParams.get('read') === '1') {
      const r = markRead(v.to, v.ids)
      return writeJson(res, 200, envelope({ ...r }, readAll(v.to).length))
    }
    const letter = postalSend({
      to: v.to,
      from: v.from || 'anonymous',
      subject: v.subject,
      body: v.body,
      replyTo: v.replyTo
    })
    writeJson(res, 200, envelope({ letter }, readAll(letter.to).length))
  } catch (err) {
    const code = err && err.code ? err.code : 'send-failed'
    writeJson(res, 400, { ok: false, error: code })
  }
}

// 「今天」：只读一屏数据。date 缺省取本地日期（带 +08:00 的当天）。
function onToday(req, res) {
  if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
  const why = blocked(req)
  if (why) return writeJson(res, 403, { ok: false, error: why })

  const url = new URL(req.url, 'http://127.0.0.1')
  const q = url.searchParams.get('date') || ''
  const date = q || new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
  if (!isValidDate(date)) return writeJson(res, 400, { ok: false, error: 'bad-date' })

  try {
    const s = state()
    writeJson(res, 200, envelope({ today: buildToday(ROOT, s, date) }, s.rev))
  } catch (err) {
    writeJson(res, 500, { ok: false, error: 'today-failed', detail: String(err && err.message) })
  }
}


// 维护台账（ADR-0002）：GET 看板，POST 开票/领票/完票/阻塞。
// 这是"可持久化维护"的接口层——票在磁盘上，谁来跑都可以。
async function onTeam(req, res) {
  const why = blocked(req)
  if (why) return writeJson(res, 403, { ok: false, error: why })

  if (req.method === 'GET') {
    const lim = parseLimit(new URL(req.url, 'http://127.0.0.1'))
    if (!lim.ok) return writeJson(res, 400, { ok: false, error: lim.error })
    try {
      const board = teamBoard(TEAM_ROOT)
      // limit 只裁剪列表；counts / stale 仍按全量算，免得控制台统计跟着变小。
      if (lim.limit !== null) board.tickets = board.tickets.slice(0, lim.limit)
      return writeJson(res, 200, envelope(board, readLedger(TEAM_ROOT).length))
    } catch (err) {
      return writeJson(res, 500, { ok: false, error: 'board-failed', detail: String(err && err.message) })
    }
  }
  if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })

  const body = await readJsonBody(req)
  if (!body.ok) return writeJson(res, 400, { ok: false, error: body.code })
  const v = body.value || {}

  try {
    const ticket = v.action ? updateTicket(TEAM_ROOT, v) : createTicket(TEAM_ROOT, v)
    return writeJson(res, 200, envelope({ ticket }, readLedger(TEAM_ROOT).length))
  } catch (err) {
    writeJson(res, 400, { ok: false, error: (err && err.code) || 'ticket-failed' })
  }
}

// 总线：三个投递通道（sub / repo / wx）共用一条 append-only 日志。
// GET  ?to=lead&limit=20 → {pending, msgs}（缺省不裁剪）；POST {lane,from,to,text,ref} → 追加一条。
async function onBus(req, res) {
  const why = blocked(req)
  if (why) return writeJson(res, 403, { ok: false, error: why })

  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://127.0.0.1')
    const to = url.searchParams.get('to') || 'lead'
    const lim = parseLimit(url)
    if (!lim.ok) return writeJson(res, 400, { ok: false, error: lim.error })
    try {
      // limit 缺省不裁剪；传了就取最近 N 条（recent 的语义）。
      const msgs = busRecent(BUS_ROOT, {
        to: url.searchParams.get('all') ? undefined : to,
        limit: lim.limit === null ? 0 : lim.limit,
      })
      return writeJson(res, 200, envelope({ pending: busPending(BUS_ROOT, to), msgs }, busRead(BUS_ROOT).lines))
    } catch (err) {
      return writeJson(res, 500, { ok: false, error: 'bus-failed', detail: String(err && err.message) })
    }
  }
  if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })

  const body = await readJsonBody(req)
  if (!body.ok) return writeJson(res, 400, { ok: false, error: body.code })
  try {
    const msg = busPost(body.value || {}, BUS_ROOT)
    return writeJson(res, 200, envelope({ msg }, busRead(BUS_ROOT).lines))
  } catch (err) {
    writeJson(res, 400, { ok: false, error: (err && err.message) || 'bus-failed' })
  }
}

export function apply(ctx) {
  const ws = (ctx.get && ctx.get('webServer')) || ctx.webServer
  if (!ws || typeof ws.register !== 'function') {
    if (ctx.logger && ctx.logger.warn) ctx.logger.warn('[neuro-loop] webServer 不可用，后端未启用')
    return
  }
  ctx.effect(() => {
    const disposers = []
    try {
      disposers.push(ws.register({ kind: 'exact', path: ROUTE_STATE, handler: onState }))
      disposers.push(ws.register({ kind: 'exact', path: ROUTE_EVENT, handler: onEvent }))
      disposers.push(ws.register({ kind: 'exact', path: ROUTE_EVENTS, handler: onEvents }))
      disposers.push(ws.register({ kind: 'exact', path: ROUTE_MAIL, handler: onMail }))
      disposers.push(ws.register({ kind: 'exact', path: ROUTE_TODAY, handler: onToday }))
      disposers.push(ws.register({ kind: 'exact', path: ROUTE_TEAM, handler: onTeam }))
      disposers.push(ws.register({ kind: 'exact', path: ROUTE_BUS, handler: onBus }))
    } catch (err) {
      for (const d of disposers) {
        try {
          d()
        } catch {
          /* noop */
        }
      }
      throw err
    }
    return () => {
      for (const d of disposers) {
        try {
          d()
        } catch {
          /* noop */
        }
      }
    }
  })
}
