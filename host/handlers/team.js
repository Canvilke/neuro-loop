// GET/POST /neuroloop/team：维护台账（ADR-0002）。
// GET 看板；POST 开票/领票/完票/阻塞——票在磁盘上，谁来跑都可以。
// 不负责：台账读写与状态机（host/team.js）、limit 解析（host/reply.js）。
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { board as teamBoard, create as createTicket, readLedger, update as updateTicket } from '../team.js'
import { readJsonBody } from '../http.js'
import { deny, denyMethod, envelope, fail, parseLimit, writeJson } from '../reply.js'

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
// 台账默认跟着仓库走；测试用 NEUROLOOP_TEAM_ROOT 指到临时目录，避免污染真台账。
const TEAM_ROOT = process.env.NEUROLOOP_TEAM_ROOT || ROOT

export async function onTeam(req, res) {
  if (deny(req, res)) return

  if (req.method === 'GET') {
    const lim = parseLimit(new URL(req.url, 'http://127.0.0.1'))
    if (!lim.ok) return fail(res, 400, lim.error)
    try {
      const board = teamBoard(TEAM_ROOT)
      // limit 只裁剪列表；counts / stale 仍按全量算，免得控制台统计跟着变小。
      if (lim.limit !== null) board.tickets = board.tickets.slice(0, lim.limit)
      return writeJson(res, 200, envelope(board, readLedger(TEAM_ROOT).length))
    } catch (err) {
      return fail(res, 500, 'board-failed', String(err && err.message))
    }
  }
  if (denyMethod(req, res, 'POST')) return

  const body = await readJsonBody(req)
  if (!body.ok) return fail(res, 400, body.code)
  const v = body.value || {}

  try {
    const ticket = v.action ? updateTicket(TEAM_ROOT, v) : createTicket(TEAM_ROOT, v)
    return writeJson(res, 200, envelope({ ticket }, readLedger(TEAM_ROOT).length))
  } catch (err) {
    fail(res, 400, (err && err.code) || 'ticket-failed')
  }
}
