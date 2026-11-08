// 信箱：跨会话投递。一个收件人一个 jsonl，追加写，读时按 id 去重。
// 为什么不做成内存队列：DSH 会被关，进程一停内存就没了；信件必须比进程活得久。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const ROOT = process.env.NEUROLOOP_HOME || path.join(os.homedir(), '.dsh', 'neuro-loop')
const MAIL_DIR = path.join(ROOT, 'mail')

const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,31}$/
const MAX_BODY = 8000
const MAX_KEEP = 500

function ensureDir () {
  fs.mkdirSync(MAIL_DIR, { recursive: true })
}

function boxPath (owner) {
  return path.join(MAIL_DIR, owner + '.jsonl')
}

export function isValidName (name) {
  return typeof name === 'string' && NAME_RE.test(name)
}

export function send ({ to, from, subject, body, replyTo }) {
  if (!isValidName(to)) throw Object.assign(new Error('bad-to'), { code: 'bad-to' })
  if (!isValidName(from)) throw Object.assign(new Error('bad-from'), { code: 'bad-from' })
  const text = typeof body === 'string' ? body : ''
  if (!text.trim()) throw Object.assign(new Error('bad-body'), { code: 'bad-body' })
  if (text.length > MAX_BODY) throw Object.assign(new Error('body-too-long'), { code: 'body-too-long' })

  ensureDir()
  const letter = {
    id: crypto.randomBytes(6).toString('hex'),
    to,
    from,
    subject: typeof subject === 'string' ? subject.slice(0, 120) : '',
    body: text,
    replyTo: typeof replyTo === 'string' ? replyTo : null,
    at: new Date().toISOString()
  }
  fs.appendFileSync(boxPath(to), JSON.stringify(letter) + '\n', 'utf8')

  // 收件箱只保留最近 MAX_KEEP 封，避免一年后读一封要解析几兆
  try {
    const all = readAll(to)
    if (all.length > MAX_KEEP) {
      const keep = all.slice(-MAX_KEEP)
      const tmp = boxPath(to) + '.tmp'
      fs.writeFileSync(tmp, keep.map(l => JSON.stringify(l) + '\n').join(''), 'utf8')
      fs.renameSync(tmp, boxPath(to))
    }
  } catch { /* 压缩失败不影响这封信已经落地 */ }

  return letter
}

export function readAll (owner) {
  if (!isValidName(owner)) return []
  const file = boxPath(owner)
  if (!fs.existsSync(file)) return []
  const out = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
  }
  return out
}

// 已读状态单独存：信件本身 append-only，不改历史
function readStatePath (owner) {
  return path.join(MAIL_DIR, owner + '.read.json')
}

function readState (owner) {
  try { return JSON.parse(fs.readFileSync(readStatePath(owner), 'utf8')) } catch { return { ids: [] } }
}

export function inbox (owner, { unreadOnly = false, limit = 50 } = {}) {
  const all = readAll(owner)
  const seen = new Set(readState(owner).ids)
  const list = all
    .map(l => ({ ...l, unread: !seen.has(l.id) }))
    .filter(l => (unreadOnly ? l.unread : true))
    .slice(-limit)
  return list
}

export function markRead (owner, ids) {
  if (!isValidName(owner) || !Array.isArray(ids)) return { marked: 0 }
  ensureDir()
  const state = readState(owner)
  const set = new Set(state.ids)
  for (const id of ids) set.add(String(id))
  fs.writeFileSync(readStatePath(owner), JSON.stringify({ ids: [...set].slice(-MAX_KEEP * 2) }), 'utf8')
  return { marked: ids.length }
}

export function mailDir () {
  return MAIL_DIR
}
