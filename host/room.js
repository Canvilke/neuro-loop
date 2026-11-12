/**
 * host/room.js — 会议室（夜间协作的对话记录）。
 *
 * 为什么单独一个文件而不是复用 bus：
 *   bus 是"投递/回执"语义（to/ack），会议室是"对话"语义（谁说的、什么类型、回哪一条）。
 *   混在一条日志里，未读数会被聊天刷爆，票单通知反而看不见。
 *
 * 只追加：坏行跳过并计数；`ask` 被 `decision`（带 ref）回答，不改写历史。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const KINDS = ['say', 'ask', 'decision']

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/
const REF_RE = /^(T-\d{4}|[0-9a-z]{8,16})$/i
const TEXT_MAX = 2000

export function roomPath(root) {
  return path.join(root, 'room', 'room.jsonl')
}

// id = 毫秒(6) + 进程内计数(2) + 本进程随机盐(3)。
// 只靠毫秒和进程内计数时，多个代表同时说话会撞：4 线程 × 25 条实测只剩 53 个唯一 id，
// 而 view(since) 用 findIndex、decide(--ref) 用第一条匹配，撞了就会读错/答错。
const SALT = crypto.randomBytes(2).toString('hex').slice(0, 3)
let counter = 0
function mintId(now = Date.now()) {
  counter = (counter + 1) % 4096
  return now.toString(36).slice(-6) + counter.toString(36).padStart(2, '0') + SALT
}

export function post(input, root) {
  const from = String((input && input.from) || 'lead').trim()
  if (!NAME_RE.test(from)) throw new Error('bad-from')

  const role = String((input && input.role) || '').trim()
  if (role && !NAME_RE.test(role)) throw new Error('bad-role')

  const kind = String((input && input.kind) || 'say').trim()
  if (!KINDS.includes(kind)) throw new Error('bad-kind')

  const text = String((input && input.text) || '').trim()
  if (!text) throw new Error('empty-text')
  if (text.length > TEXT_MAX) throw new Error('text-too-long')

  let ref = null
  if (input && input.ref) {
    ref = String(input.ref).trim()
    if (!REF_RE.test(ref)) throw new Error('bad-ref')
  }
  if (kind === 'decision' && !ref) throw new Error('decision-needs-ref')

  const rec = {
    id: mintId(),
    at: new Date().toISOString(),
    from,
    ...(role ? { role } : {}),
    kind,
    text,
    ...(ref ? { ref } : {}),
  }

  const file = roomPath(root)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // 半行之后直接追加会把两行粘成一行：末字节不是换行就先补一个（与 bus 同一处理）。
  try {
    const st = fs.statSync(file)
    if (st.size > 0) {
      const fd = fs.openSync(file, 'r')
      const buf = Buffer.alloc(1)
      fs.readSync(fd, buf, 0, 1, st.size - 1)
      fs.closeSync(fd)
      if (buf[0] !== 10) fs.appendFileSync(file, '\n', 'utf8')
    }
  } catch {
    /* 首次写 */
  }
  fs.appendFileSync(file, JSON.stringify(rec) + '\n', 'utf8')
  return rec
}

export function read(root) {
  const file = roomPath(root)
  if (!fs.existsSync(file)) return { rows: [], bad: 0, lines: 0 }
  const raw = fs.readFileSync(file, 'utf8').split('\n')
  const rows = []
  let bad = 0
  let lines = 0
  for (const line of raw) {
    if (!line.trim()) continue
    lines += 1
    try {
      const obj = JSON.parse(line)
      if (obj && obj.id && obj.from && obj.text && KINDS.includes(obj.kind)) rows.push(obj)
      else bad += 1
    } catch {
      bad += 1
    }
  }
  return { rows, bad, lines }
}

/** 还没有被 decision 回答的 ask。 */
export function openAsks(rows) {
  const answered = new Set()
  for (const r of rows) if (r.kind === 'decision' && r.ref) answered.add(r.ref)
  return rows.filter((r) => r.kind === 'ask' && !answered.has(r.id))
}

export function view(root, { since = '', limit = 0 } = {}) {
  const { rows, bad, lines } = read(root)

  let kept = rows
  if (since) {
    const asId = kept.findIndex((r) => r.id === since)
    if (asId >= 0) kept = kept.slice(asId + 1)
    else {
      const t = Date.parse(since)
      if (Number.isFinite(t)) kept = kept.filter((r) => Date.parse(r.at) >= t)
    }
  }
  const cap = Number.isFinite(limit) && limit > 0 ? Math.min(300, Math.floor(limit)) : 0
  const msgs = cap ? kept.slice(-cap) : kept
  return { msgs, open: openAsks(rows), bad, lines }
}
