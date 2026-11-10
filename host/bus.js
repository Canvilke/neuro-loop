/**
 * host/bus.js — 总线读取与写入（与 tools/bus.mjs 同一份 jsonl）。
 *
 * 为什么宿主也要有一份读写：控制台要显示未读、其它 agent 可以走 HTTP 投递，
 * 而 CLI 那条路径在宿主没起时也能用。两边格式必须完全一致，靠 `test/bus.test.mjs`
 * 与 `test/host.mjs` 双向校验。
 *
 * 只追加：坏行跳过并计数；ack 也是追加行（{id, ack:[...]}），不改写历史。
 */
import fs from 'node:fs'
import path from 'node:path'

export const LANES = ['sub', 'repo', 'wx', 'note']

export function busPath(root) {
  return path.join(root, 'bus', 'bus.jsonl')
}

let counter = 0
export function mintId(now = Date.now(), salt = '') {
  counter = (counter + 1) % 4096
  const body = `${now}:${counter}:${salt}:${Math.random().toString(36).slice(2, 8)}`
  let h = 0x811c9dc5
  for (let i = 0; i < body.length; i += 1) {
    h ^= body.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0') + now.toString(36).slice(-4)
}

export function post(input, root) {
  const lane = String(input.lane ?? '').trim()
  if (!LANES.includes(lane)) throw new Error('bad-lane')
  const text = String(input.text ?? '').trim()
  if (!text) throw new Error('empty-text')
  if (text.length > 4000) throw new Error('text-too-long')
  const rec = {
    id: mintId(Date.now(), lane),
    at: new Date().toISOString(),
    lane,
    from: String(input.from ?? 'lead').trim() || 'lead',
    to: String(input.to ?? 'lead').trim() || 'lead',
    text,
    ...(input.ref ? { ref: String(input.ref) } : {}),
  }
  const file = busPath(root)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // 与 tools/bus.mjs 同一处理：坏行（半行）之后追加前先补换行。
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
  const file = busPath(root)
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
      if (obj && obj.id && (obj.lane || Array.isArray(obj.ack))) rows.push(obj)
      else bad += 1
    } catch {
      bad += 1
    }
  }
  return { rows, bad, lines }
}

export function view(root) {
  const { rows, bad, lines } = read(root)
  const acked = new Set()
  for (const r of rows) if (Array.isArray(r.ack)) for (const id of r.ack) acked.add(id)
  return { msgs: rows.filter((r) => r.lane), acked, bad, lines }
}

export function pending(root, to = 'lead') {
  const { msgs, acked } = view(root)
  const out = { sub: 0, repo: 0, wx: 0, note: 0 }
  for (const m of msgs) {
    if (acked.has(m.id) || m.to !== to) continue
    if (m.lane in out) out[m.lane] += 1
  }
  return out
}

export function recent(root, { to, limit = 20 } = {}) {
  const { msgs, acked } = view(root)
  const rows = msgs
    .filter((m) => !to || m.to === to)
    .slice(-Math.max(1, Math.min(200, limit)))
    .reverse()
    .map((m) => ({ ...m, read: acked.has(m.id) }))
  return rows
}
