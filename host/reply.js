// 路由层共用的守卫与响应壳。
// 负责：本机/同源判定、方法不符的 405、limit 解析、成功外壳 envelope、失败体。
// 不负责：业务校验（host/event.js）、落盘（host/service.js）、路由表（index.js）。
import { isLoopback, isSameOrigin, writeJson } from './http.js'

export { writeJson }

/** 列表端点的 limit 上限（HTTP 层的边界，改它等于改接口）。 */
export const LIMIT_MAX = 200

/** 本机 + 同源；不满足时返回错误码，满足返回 null。 */
export function blocked(req) {
  if (!isLoopback(req)) return 'not-loopback'
  if (!isSameOrigin(req)) return 'origin-mismatch'
  return null
}

/** 守卫不过时写好 403；返回 true 表示请求到此为止。 */
export function deny(req, res) {
  const why = blocked(req)
  if (!why) return false
  writeJson(res, 403, { ok: false, error: why })
  return true
}

/** 方法不符时写好 405；返回 true 表示请求到此为止。 */
export function denyMethod(req, res, method) {
  if (req.method === method) return false
  writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
  return true
}

/**
 * 解析列表端点的 limit：缺省 → 不裁剪（null）；非法 → { ok:false, error:'bad-limit' }。
 * 只认 1..200 的十进制整数，避免 Number('') / '5.0' / '1e3' 这类含糊值过关。
 */
export function parseLimit(url) {
  if (!url.searchParams.has('limit')) return { ok: true, limit: null }
  const text = url.searchParams.get('limit')
  if (!/^\d+$/.test(text)) return { ok: false, error: 'bad-limit' }
  const n = Number(text)
  if (!Number.isInteger(n) || n < 1 || n > LIMIT_MAX) return { ok: false, error: 'bad-limit' }
  return { ok: true, limit: n }
}

// 成功响应统一外壳：{ ok:true, data, rev }。
// 旧客户端按顶层字段读（state / msgs / tickets / today ...），所以原载荷也平铺保留一份。
export function envelope(payload, rev) {
  return { ok: true, rev, ...payload, data: payload }
}

/** 失败响应：{ ok:false, error }；detail 只在排障分支带（不改变错误码）。 */
export function fail(res, status, error, detail) {
  writeJson(res, status, detail === undefined ? { ok: false, error } : { ok: false, error, detail })
}
