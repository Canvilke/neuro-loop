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

// 依赖 webServer：这个 profile 一定有它（页面就是它发的）。
// 不用 { optional: [...] } 的写法——当前 loader 会把键名当成服务名去等，
// 结果卡在 "waiting for service: optional"。
export const inject = ['webServer']

export const ROUTE_STATE = '/neuroloop/state'
export const ROUTE_EVENT = '/neuroloop/event'

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
