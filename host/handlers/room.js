// GET/POST /neuroloop/room：夜间会议室的对话日志。
// GET  ?since=<id|ISO>&limit=60 → {msgs, open, bad}；POST {from,role,text,kind,ref} → 追加一条。
// 不负责：读写实现（host/room.js）、守卫与外壳（host/reply.js）。
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { post as roomPost, read as roomRead, view as roomView } from '../room.js'
import { readJsonBody } from '../http.js'
import { deny, denyMethod, envelope, fail, parseLimit, writeJson } from '../reply.js'

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
// 测试会在 import 之后再设 NEUROLOOP_ROOM_ROOT，所以这里必须惰性读，不能固化
function roomRoot() { return process.env.NEUROLOOP_ROOM_ROOT || ROOT }

export async function onRoom(req, res) {
  if (deny(req, res)) return

  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://127.0.0.1')
    const lim = parseLimit(url)
    if (!lim.ok) return fail(res, 400, lim.error)
    try {
      const v = roomView(roomRoot(), {
        since: url.searchParams.get('since') || '',
        limit: lim.limit === null ? 60 : lim.limit,
      })
      return writeJson(res, 200, envelope(v, roomRead(roomRoot()).lines))
    } catch (err) {
      return fail(res, 500, 'room-failed', String(err && err.message))
    }
  }
  if (denyMethod(req, res, 'POST')) return

  const body = await readJsonBody(req)
  if (!body.ok) return fail(res, 400, body.code)
  try {
    const msg = roomPost(body.value || {}, roomRoot())
    return writeJson(res, 200, envelope({ msg }, roomRead(roomRoot()).lines))
  } catch (err) {
    fail(res, 400, (err && err.message) || 'room-failed')
  }
}
