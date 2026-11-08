// Neuro-Loop 宿主半边（S1/S2）。
//
// 打包插件的客户端半边没有 host.call，所以前后端之间只有一条路：HTTP。
// 这里只负责两件事——读投影、写事件。视觉不在这里。
//
//   GET  /neuroloop/state    → 整个投影（客户端启动时合并）
//   POST /neuroloop/event    → 追加一条事件（recall | note | flatten | unflatten）

import { appendEvent, derive, fold, loadState, saveState } from './host/store.js'
import { isLoopback, isSameOrigin, readJsonBody, writeJson } from './host/http.js'
import { normalizeEvent } from './host/event.js'
import { inbox, markRead, send as postalSend, isValidName } from './host/mail.js'

// 依赖 webServer：这个 profile 一定有它（页面就是它发的）。
// 不用 { optional: [...] } 的写法——当前 loader 会把键名当成服务名去等，
// 结果卡在 "waiting for service: optional"。
export const inject = ['webServer']

export const ROUTE_STATE = '/neuroloop/state'
export const ROUTE_EVENT = '/neuroloop/event'
export const ROUTE_MAIL = '/neuroloop/mail'

let CACHE = null

function state() {
  if (!CACHE) CACHE = loadState()
  return CACHE
}

/** 测试用：丢掉内存缓存，下次读会从磁盘/事件重建。 */
export function resetCache() {
  CACHE = null
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
    // 顺序要紧：先落 L1（真源），再改 L2，再原子覆盖。
    appendEvent(norm.event)
    const s = state()
    fold(s, norm.event)
    derive(s)
    saveState(s)
    writeJson(res, 200, { ok: true, rev: s.rev, event: norm.event, state: s })
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
