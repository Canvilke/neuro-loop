// GET/POST /neuroloop/bus：三个投递通道（sub / repo / wx）共用一条 append-only 日志。
// GET  ?to=lead&limit=20 → {pending, msgs}（缺省不裁剪）；POST {lane,from,to,text,ref} → 追加一条。
// 不负责：日志读写（host/bus.js）、limit 解析（host/reply.js）。
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { post as busPost, pending as busPending, read as busRead, recent as busRecent } from '../bus.js'
import { readJsonBody } from '../http.js'
import { deny, denyMethod, envelope, fail, parseLimit, writeJson } from '../reply.js'

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
const BUS_ROOT = process.env.NEUROLOOP_BUS_ROOT || ROOT

export async function onBus(req, res) {
  if (deny(req, res)) return

  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://127.0.0.1')
    const to = url.searchParams.get('to') || 'lead'
    const lim = parseLimit(url)
    if (!lim.ok) return fail(res, 400, lim.error)
    try {
      // limit 缺省不裁剪；传了就取最近 N 条（recent 的语义）。
      const msgs = busRecent(BUS_ROOT, {
        to: url.searchParams.get('all') ? undefined : to,
        limit: lim.limit === null ? 0 : lim.limit,
      })
      return writeJson(res, 200, envelope({ pending: busPending(BUS_ROOT, to), msgs }, busRead(BUS_ROOT).lines))
    } catch (err) {
      return fail(res, 500, 'bus-failed', String(err && err.message))
    }
  }
  if (denyMethod(req, res, 'POST')) return

  const body = await readJsonBody(req)
  if (!body.ok) return fail(res, 400, body.code)
  try {
    const msg = busPost(body.value || {}, BUS_ROOT)
    return writeJson(res, 200, envelope({ msg }, busRead(BUS_ROOT).lines))
  } catch (err) {
    fail(res, 400, (err && err.message) || 'bus-failed')
  }
}
