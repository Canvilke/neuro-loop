// GET /neuroloop/today：只读一屏数据。date 缺省取本地日期（带 +08:00 的当天）。
// 不负责：排程计算（host/today.js）、投影（host/service.js）。
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getState } from '../service.js'
import { buildToday, isValidDate } from '../today.js'
import { deny, denyMethod, envelope, fail, writeJson } from '../reply.js'

// 仓库根目录：plan/ 与 daily/ 都在这下面。
const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))

export function onToday(req, res) {
  if (denyMethod(req, res, 'GET')) return
  if (deny(req, res)) return

  const url = new URL(req.url, 'http://127.0.0.1')
  const q = url.searchParams.get('date') || ''
  const date = q || new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
  if (!isValidDate(date)) return fail(res, 400, 'bad-date')

  try {
    const s = getState()
    writeJson(res, 200, envelope({ today: buildToday(ROOT, s, date) }, s.rev))
  } catch (err) {
    fail(res, 500, 'today-failed', String(err && err.message))
  }
}
