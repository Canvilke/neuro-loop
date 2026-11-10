// 请求侧的小工具：只允许本机、同源、JSON、≤64KB。
// 这些不是"以防万一"，是因为写路由会落盘——落盘的东西要有边界。

export const BODY_LIMIT = 64 * 1024

export function isLoopback(req) {
  const addr = (req.socket && req.socket.remoteAddress) || ''
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

/** 有 Origin 就必须同源；没有 Origin（同页 fetch 的常见形态）放行。 */
export function isSameOrigin(req) {
  const origin = req.headers && req.headers.origin
  if (!origin) return true
  try {
    const host = req.headers.host
    if (!host) return false
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export function writeJson(res, status, payload, extra) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  if (extra) for (const k of Object.keys(extra)) res.setHeader(k, extra[k])
  res.end(body)
}

/**
 * 读 JSON 体。超限、非 JSON、非对象都返回 {ok:false}。
 * opts.allowArray：批量端点也收裸数组；缺省仍只收对象，单条路由的行为不变。
 */
export function readJsonBody(req, opts = {}) {
  const allowArray = opts.allowArray === true
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    let done = false
    const finish = (value) => {
      if (done) return
      done = true
      resolve(value)
    }
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > BODY_LIMIT) {
        finish({ ok: false, code: 'body-too-large' })
        try {
          req.destroy()
        } catch {
          /* noop */
        }
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text) return finish({ ok: false, code: 'empty-body' })
      let value
      try {
        value = JSON.parse(text)
      } catch {
        return finish({ ok: false, code: 'bad-json' })
      }
      if (!value || typeof value !== 'object' || (!allowArray && Array.isArray(value))) {
        return finish({ ok: false, code: 'bad-shape' })
      }
      finish({ ok: true, value })
    })
    req.on('error', () => finish({ ok: false, code: 'read-error' }))
  })
}
