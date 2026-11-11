// GET/POST /neuroloop/mail：跨会话投递。GET 取信、POST 寄信、POST ?read=1 标记已读。
// 有意的限制：只接受本机同源请求——信件里可能写作业内容，不该被网页上的任意站点读走。
// 不负责：信箱文件读写（host/mail.js）、请求体读取（host/http.js）。
import { inbox, markRead, readAll, send as postalSend, isValidName } from '../mail.js'
import { readJsonBody } from '../http.js'
import { deny, denyMethod, envelope, fail, writeJson } from '../reply.js'

export async function onMail(req, res) {
  if (deny(req, res)) return

  const url = new URL(req.url, 'http://127.0.0.1')

  if (req.method === 'GET') {
    const box = url.searchParams.get('to') || ''
    if (!isValidName(box)) return fail(res, 400, 'bad-to')
    const unreadOnly = url.searchParams.get('unread') === '1'
    const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100)
    try {
      const letters = inbox(box, { unreadOnly, limit })
      writeJson(res, 200, envelope({ to: box, letters }, readAll(box).length))
    } catch (err) {
      fail(res, 500, 'read-failed', String(err && err.message))
    }
    return
  }

  if (denyMethod(req, res, 'POST')) return

  const body = await readJsonBody(req)
  if (!body.ok) return fail(res, 400, body.code)
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
      replyTo: v.replyTo,
    })
    writeJson(res, 200, envelope({ letter }, readAll(letter.to).length))
  } catch (err) {
    const code = err && err.code ? err.code : 'send-failed'
    fail(res, 400, code)
  }
}
