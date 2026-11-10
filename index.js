// Neuro-Loop 宿主半边（S1/S2）。
//
// 打包插件的客户端半边没有 host.call，所以前后端之间只有一条路：HTTP。
// 这里只负责两件事——读投影、写事件。视觉不在这里。
//
//   GET  /neuroloop/state    → 整个投影（客户端启动时合并）
//   POST /neuroloop/event    → 追加一条事件（recall | note | flatten | unflatten）

import { addEvent, getState, reset as resetService } from './host/service.js'
import { isLoopback, isSameOrigin, readJsonBody, writeJson } from './host/http.js'
import { normalizeEvent } from './host/event.js'
import { inbox, markRead, send as postalSend, isValidName } from './host/mail.js'
import { buildToday, isValidDate } from './host/today.js'
import { board as teamBoard, create as createTicket, update as updateTicket } from './host/team.js'
import { post as busPost, pending as busPending, recent as busRecent } from './host/bus.js'
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

function onState(req, res) {
  if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
  const why = blocked(req)
  if (why) return writeJson(res, 403, { ok: false, error: why })
  try {
    writeJson(res, 200, { ok: true, state: state() })
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
    writeJson(res, 200, { ok: true, rev: s.rev, event: stored, state: s })
  } catch (err) {
    writeJson(res, 500, { ok: false, error: 'write-failed', detail: String(err && err.message) })
  }
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
      writeJson(res, 200, { ok: true, to: box, letters: inbox(box, { unreadOnly, limit }) })
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
      return writeJson(res, 200, { ok: true, ...r })
    }
    const letter = postalSend({
      to: v.to,
      from: v.from || 'anonymous',
      subject: v.subject,
      body: v.body,
      replyTo: v.replyTo
    })
    writeJson(res, 200, { ok: true, letter })
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
    writeJson(res, 200, { ok: true, today: buildToday(ROOT, state(), date) })
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
    try {
      return writeJson(res, 200, { ok: true, ...teamBoard(TEAM_ROOT) })
    } catch (err) {
      return writeJson(res, 500, { ok: false, error: 'board-failed', detail: String(err && err.message) })
    }
  }
  if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })

  const body = await readJsonBody(req)
  if (!body.ok) return writeJson(res, 400, { ok: false, error: body.code })
  const v = body.value || {}

  try {
    if (v.action) return writeJson(res, 200, { ok: true, ticket: updateTicket(TEAM_ROOT, v) })
    return writeJson(res, 200, { ok: true, ticket: createTicket(TEAM_ROOT, v) })
  } catch (err) {
    writeJson(res, 400, { ok: false, error: (err && err.code) || 'ticket-failed' })
  }
}

// 总线：三个投递通道（sub / repo / wx）共用一条 append-only 日志。
// GET  ?to=lead&limit=20 → {pending, msgs}；POST {lane,from,to,text,ref} → 追加一条。
async function onBus(req, res) {
  const why = blocked(req)
  if (why) return writeJson(res, 403, { ok: false, error: why })

  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://127.0.0.1')
    const to = url.searchParams.get('to') || 'lead'
    const limit = Number(url.searchParams.get('limit') || 20)
    try {
      return writeJson(res, 200, {
        ok: true,
        pending: busPending(BUS_ROOT, to),
        msgs: busRecent(BUS_ROOT, { to: url.searchParams.get('all') ? undefined : to, limit }),
      })
    } catch (err) {
      return writeJson(res, 500, { ok: false, error: 'bus-failed', detail: String(err && err.message) })
    }
  }
  if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })

  const body = await readJsonBody(req)
  if (!body.ok) return writeJson(res, 400, { ok: false, error: body.code })
  try {
    return writeJson(res, 200, { ok: true, msg: busPost(body.value || {}, BUS_ROOT) })
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
