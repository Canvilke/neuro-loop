// L1 事件流 + L2 投影。L1 只追加，L2 可整份删除后重建（ADR-1）。
//
// 目录：%USERPROFILE%\.dsh\neuro-loop\
//   events-YYYY-MM.jsonl   一行一个事件，按月切
//   state.json             由事件算出来的投影（cache，可删）
//   imports/               外部导入的只读快照（不并入 L1）
//
// 测试用 NEUROLOOP_HOME 覆盖根目录（必须在 import 之前设置）。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const VERSION = 1

export const ROOT = process.env.NEUROLOOP_HOME
  ? path.resolve(process.env.NEUROLOOP_HOME)
  : path.join(os.homedir(), '.dsh', 'neuro-loop')

export const STATE_PATH = path.join(ROOT, 'state.json')

const DAY = 86400000
const HOUR = 3600000

export function ensureRoot() {
  fs.mkdirSync(ROOT, { recursive: true })
}

function monthOf(d) {
  const x = d instanceof Date ? d : new Date(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function eventsPath(when) {
  return path.join(ROOT, `events-${monthOf(when || new Date())}.jsonl`)
}

/** 追加一条事件。同步写，坏在最后一行也只丢这一条。 */
export function appendEvent(ev) {
  ensureRoot()
  const line = JSON.stringify(ev) + '\n'
  const file = eventsPath(ev.t)
  fs.appendFileSync(file, line, 'utf8')
  return { file, bytes: Buffer.byteLength(line) }
}

/** 读全部事件（按月文件名升序 = 时间升序）。坏行跳过并计数。 */
export function readAllEvents() {
  let names = []
  try {
    names = fs.readdirSync(ROOT).filter((n) => /^events-\d{4}-\d{2}\.jsonl$/.test(n)).sort()
  } catch {
    return { events: [], bad: 0, files: 0 }
  }
  const events = []
  let bad = 0
  for (const name of names) {
    let text = ''
    try {
      text = fs.readFileSync(path.join(ROOT, name), 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      if (!line) continue
      try {
        const ev = JSON.parse(line)
        if (ev && typeof ev.t === 'string' && typeof ev.k === 'string') events.push(ev)
        else bad++
      } catch {
        bad++
      }
    }
  }
  return { events, bad, files: names.length }
}

export function emptyState() {
  return {
    version: VERSION,
    rev: 0,
    updatedAt: null,
    nodes: {},
    flattened: [],
    daily: {},
    events: 0,
    badLines: 0,
  }
}

function nodeOf(state, id) {
  let n = state.nodes[id]
  if (!n) {
    n = state.nodes[id] = {
      hits: 0,
      misses: 0,
      streak: 0,
      notes: 0,
      lastAt: null,
      dueAt: null,
      hitRate: null,
    }
  }
  return n
}

/** 复习间隔（天）→ 毫秒。未校准：基础 1 天、连对翻倍、封顶 45 天；错一次 8 小时。 */
export function intervalMs(streak, ok) {
  if (!ok) return 8 * HOUR
  const days = Math.min(45, Math.pow(2, Math.max(0, streak - 1)))
  return days * DAY
}

export function fold(state, ev) {
  state.events += 1
  state.updatedAt = ev.t
  if (ev.k === 'recall') {
    const n = nodeOf(state, ev.n)
    const ok = ev.ok ? 1 : 0
    if (ok) {
      n.hits += 1
      n.streak += 1
    } else {
      n.misses += 1
      n.streak = 0
    }
    n.lastAt = ev.t
    n.dueAt = new Date(Date.parse(ev.t) + intervalMs(n.streak, ok)).toISOString()
  } else if (ev.k === 'note') {
    const n = nodeOf(state, ev.n)
    n.notes += 1
  } else if (ev.k === 'daily') {
    if (!state.daily) state.daily = {}
    const day = state.daily[ev.d] || (state.daily[ev.d] = {})
    day[ev.s] = { minutes: ev.min, wrong: ev.w, blocked: ev.blk, note: ev.note, at: ev.t }
  } else if (ev.k === 'flatten') {
    if (!state.flattened.includes(ev.s)) state.flattened.push(ev.s)
  } else if (ev.k === 'unflatten') {
    state.flattened = state.flattened.filter((s) => s !== ev.s)
  }
  return state
}

export function derive(state) {
  for (const id of Object.keys(state.nodes)) {
    const n = state.nodes[id]
    const total = n.hits + n.misses
    n.hitRate = total ? Math.round((n.hits / total) * 1000) / 1000 : null
  }
  // rev 就是事件条数：单调、可复算。重建出来的 rev 和在线时一致，才敢拿来判新旧。
  state.rev = state.events
  return state
}

export function rebuild() {
  const { events, bad } = readAllEvents()
  const state = emptyState()
  state.badLines = bad
  for (const ev of events) fold(state, ev)
  return derive(state)
}

/** 读投影；缺失/版本不符则重建。 */
export function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
    if (raw && raw.version === VERSION && raw.nodes) {
      if (!raw.daily) raw.daily = {}
      return raw
    }
  } catch {
    /* 落到重建 */
  }
  const rebuilt = rebuild()
  saveState(rebuilt)
  return rebuilt
}

/** 临时文件 + rename：要么是旧内容，要么是新内容，不会半截。 */
export function saveState(state) {
  ensureRoot()
  const tmp = STATE_PATH + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8')
  fs.renameSync(tmp, STATE_PATH)
  return STATE_PATH
}
