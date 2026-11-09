// 「今天」——把散在四个文件里的信息拼成前端能直接渲染的一屏。
//
// 为什么要有这一条路由：客户端拿不到文件系统，而"今天做什么"分布在
//   plan/politics-schedule.json  政治第几天、哪两页
//   plan/en-schedule.json        英语第几天、词组 a–b
//   plan/tasks-config.json       数理化今天各一行任务
//   state.json                   哪里到期、今天勾了什么
// 让前端各自去猜是行不通的，所以由宿主统一算好。
//
// 只读：不写任何文件，不推进排程。排程按"第几天"算，日期只是输入。

import fs from 'node:fs'
import path from 'node:path'

// 排程第 1 天对应的日期（政治与英语都从这里起算）。
export const SCHEDULE_DAY1 = '2026-11-09'
export const SUBJECT_NAMES = {
  chinese: '语文',
  math: '数学',
  english: '英语',
  physics: '物理',
  chemistry: '化学',
  politics: '政治'
}
const SUBJECT_ORDER = ['chinese', 'math', 'english', 'physics', 'chemistry', 'politics']

const DAY_MS = 24 * 60 * 60 * 1000

function parseDay(s) {
  // 固定按 +08:00 算"日"，避免机器时区变化把第几天算歪。
  const t = Date.parse(`${s}T00:00:00+08:00`)
  return Number.isFinite(t) ? t : NaN
}

export function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(parseDay(s))
}

/** 排程里的"第几天"（1 起）。2026-11-09 → 1。 */
export function scheduleDay(dateStr, day1 = SCHEDULE_DAY1) {
  const a = parseDay(dateStr)
  const b = parseDay(day1)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const d = Math.round((a - b) / DAY_MS)
  return d >= 0 ? d + 1 : null
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function exists(file) {
  try {
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

/** 数理化今日任务：第 d 天取该学科池里第 (d-1+序号) 项，跨轮从头。 */
function pickTasks(cfg, dayNo) {
  if (!cfg || !cfg.pools) return []
  const rotate = Array.isArray(cfg.rotate) ? cfg.rotate : Object.keys(cfg.pools)
  const max = Number(cfg.maxPerDay) || 6
  const baseDay = scheduleDay(cfg.start || SCHEDULE_DAY1) || 1
  const step = Math.max(0, (dayNo || 1) - baseDay)
  const out = []
  rotate.forEach((name, i) => {
    const pool = cfg.pools[name]
    if (!Array.isArray(pool) || !pool.length) return
    const item = pool[(step + i) % pool.length]
    out.push({ subject: name, text: item.text, min: Number(item.min) || 25 })
  })
  return out.slice(0, max)
}

/** 到期/记录统计。node id 形如 `math-deriv`，学科取连字符前一段。 */
function progress(state, now) {
  const nodes = (state && state.nodes) || {}
  const per = {}
  let dueTotal = 0
  const due = []
  for (const id of Object.keys(nodes)) {
    const n = nodes[id] || {}
    const subject = String(id).split('-')[0]
    if (!per[subject]) per[subject] = { due: 0, nodes: 0, hit: 0, miss: 0 }
    per[subject].nodes += 1
    per[subject].hit += Number(n.hits) || 0
    per[subject].miss += Number(n.misses) || 0
    const t = n.dueAt ? Date.parse(n.dueAt) : NaN
    if (Number.isFinite(t) && t <= now) {
      per[subject].due += 1
      dueTotal += 1
      due.push({ id, dueAt: n.dueAt, hitRate: n.hitRate, streak: n.streak })
    }
  }
  due.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
  const subjects = SUBJECT_ORDER.filter((s) => per[s]).map((s) => ({
    id: s,
    name: SUBJECT_NAMES[s] || s,
    nodes: per[s].nodes,
    due: per[s].due,
    hit: per[s].hit,
    miss: per[s].miss
  }))
  return {
    dueTotal,
    due: due.slice(0, 8),
    subjects,
    flattened: Array.isArray(state && state.flattened) ? state.flattened.length : 0
  }
}

/**
 * 拼出「今天」一屏。
 * @param {string} root  仓库目录（plan/ 与 daily/ 的父目录）
 * @param {object} state 已加载的投影
 * @param {string} date  YYYY-MM-DD
 */
export function buildToday(root, state, date) {
  const dayNo = scheduleDay(date)
  const polCfg = readJson(path.join(root, 'plan', 'politics-schedule.json'))
  const enCfg = readJson(path.join(root, 'plan', 'en-schedule.json'))
  const taskCfg = readJson(path.join(root, 'plan', 'tasks-config.json'))

  const polDay = polCfg && Array.isArray(polCfg.days) ? polCfg.days.find((d) => d.day === dayNo) : null
  const enDay = enCfg && Array.isArray(enCfg.days) ? enCfg.days.find((d) => d.day === dayNo) : null

  const papers = (prefix) => {
    const docx = path.join(root, 'daily', `${prefix}-${date}.docx`)
    const pdf = path.join(root, 'daily', `${prefix}-${date}.pdf`)
    return { docx: exists(docx), pdf: exists(pdf) }
  }

  const daily = (state && state.daily && state.daily[date]) || {}

  return {
    date,
    weekday: new Date(`${date}T00:00:00+08:00`).getDay(),
    dayNo,
    politics: polDay
      ? {
          day: polDay.day,
          unit: polDay.unit,
          book: polDay.book,
          from: polDay.from,
          to: polDay.to,
          pages: polDay.pages,
          text: `P.${polDay.from}–${polDay.to}`
        }
      : null,
    english: enDay
      ? { day: enDay.day, from: enDay.from, to: enDay.to, count: enDay.count, first: enDay.first, last: enDay.last }
      : null,
    tasks: pickTasks(taskCfg, dayNo),
    papers: { politics: papers('pol'), english: papers('en') },
    progress: progress(state, Date.now()),
    recorded: SUBJECT_ORDER.filter((s) => daily[s]).map((s) => ({
      subject: s,
      name: SUBJECT_NAMES[s] || s,
      minutes: daily[s].minutes,
      wrong: Array.isArray(daily[s].wrong) ? daily[s].wrong.length : 0,
      blocked: daily[s].blocked || '',
      at: daily[s].at
    })),
    total: {
      politicsDays: polCfg && Array.isArray(polCfg.days) ? polCfg.days.length : 0,
      englishDays: enCfg && Array.isArray(enCfg.days) ? enCfg.days.length : 0
    }
  }
}
