// GET /neuroloop/export?format=html&what=due|blind|fp&subject=math
//
// 只读：把当前投影里的三条清单排成一张 A4 单页、黑白可读、可直接 Ctrl+P 的 HTML。
// 不负责：调度（core/metrics）、投影（core/state）、落盘（host/service）。本文件只做
// 「取数 → 排序 → 排字」，不含任何新的判定规则：
//   due   —— attempts>0 且 dueAt ≤ now（与 core/state dueList 同一条件）
//   blind —— 从没测过（attempts===0），或 classify 判为 fragile（命中率低/有假阳性）
//   fp    —— falsePositive（hits>0 且 fp>0，core/metrics.isFalsePositive）
// 假阳性同时是 fragile，所以 blind 里剔掉 fp，避免同一考点印两遍。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SUBJECTS } from '../../core/contract.js'
import { conceptSummary } from '../../core/state.js'
import { getState } from '../service.js'
import { deny, denyMethod, escapeHtml, fail, writeHtml } from '../reply.js'

// 仓库根目录：data/seed.json（标签、方法判据）与 daily/ 都在这下面。
const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))

export const WHATS = Object.freeze(['due', 'blind', 'fp'])

/** 单页最多印多少行，超出只在页脚报数（A4 一页约 40 行，不靠分页把纸打穿）。 */
export const ROW_CAP = 40

/** 中国标准时间，与 host/today.js 一致；导出页上的时间是可读的本地时间。 */
const TZ_OFFSET_MS = 8 * 3600 * 1000

const TITLE = Object.freeze({
  due: '到期复习 · DUE',
  blind: '盲区 · BLIND',
  fp: '假阳性 · FALSE+',
})

const HINT = Object.freeze({
  due: '已到复习期，按到期先后排。',
  blind: '从没测过，或测过但不稳（命中率低或出过假阳性）。',
  fp: '命中过但实做失败，考场最容易翻车的一类。',
})

/* —— seed 只用来补标签：学科名、块名、考点中文名、方法判据。读不到就退化成 id。 —— */
let seedCache
function seedIndex() {
  if (seedCache !== undefined) return seedCache
  seedCache = { subjects: {}, nodes: {}, groups: {} }
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'seed.json'), 'utf8'))
    for (const s of raw.subjects ?? []) {
      seedCache.subjects[s.id] = s.name || s.id
      for (const g of s.groups ?? []) seedCache.groups[g.id] = { label: g.label || g.id, subject: s.id }
      for (const n of s.nodes ?? []) seedCache.nodes[n.id] = { ...n, subject: s.id }
    }
  } catch {
    seedCache = { subjects: {}, nodes: {}, groups: {} }
  }
  return seedCache
}

/** 学科前缀：`math-deriv` → `math`；不在 SUBJECTS 里的归 other。 */
function subjectOf(id) {
  const prefix = String(id).split('-')[0]
  return SUBJECTS.includes(prefix) ? prefix : 'other'
}

/**
 * 三条清单的取数与排序。纯函数：只读 state 与考点目录，不读时钟以外的东西。
 *
 * 盲区要连"从没测过"的考点一起印，而投影里只有测过的桶，所以 blind 会补上目录里
 * 没有桶的考点（标记 未测）。`catalog` 缺省取 data/seed.json；传 `{nodes:{}}` 可关掉
 * 这一步（测试用它把规则钉死）。
 * @param {object} state 投影
 * @param {'due'|'blind'|'fp'} what
 * @param {string} subjectId 空串 = 全部学科
 * @param {number} nowMs
 * @param {{nodes?:object}} [catalog]
 * @returns {{total:number, rows:object[]}}
 */
export function collect(state, what, subjectId, nowMs, catalog = seedIndex()) {
  const picked = []
  // host 的投影叫 nodes（host/service.js view()），core 的重建叫 concepts；两边都是同一组计数桶。
  const buckets = state.nodes ?? state.concepts ?? {}
  for (const [id, bucket] of Object.entries(buckets)) {
    const s = conceptSummary({ ...bucket, id }, nowMs)
    const subject = subjectOf(s.id)
    if (subjectId && subject !== subjectId) continue

    if (what === 'due') {
      if (!(s.attempts > 0 && s.dueAt && new Date(s.dueAt).getTime() <= nowMs)) continue
    } else if (what === 'blind') {
      const untested = s.attempts === 0
      const fragile = s.classify === 'fragile' && !s.falsePositive
      if (!untested && !fragile) continue
    } else if (!s.falsePositive) {
      continue
    }

    picked.push({ ...s, subject, why: what === 'blind' ? (s.attempts === 0 ? '未测' : '不稳') : '' })
  }

  if (what === 'blind') {
    // 目录里有、投影里没有桶的考点 = 从没测过。这是盲区最该被看见的那一类。
    for (const id of Object.keys(catalog.nodes ?? {})) {
      if (Object.prototype.hasOwnProperty.call(buckets, id)) continue
      const subject = subjectOf(id)
      if (subjectId && subject !== subjectId) continue
      picked.push({ id, subject, attempts: 0, why: '未测' })
    }
  }

  if (what === 'due') {
    picked.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt) || a.id.localeCompare(b.id))
  } else if (what === 'blind') {
    // 先列从没测过的，再列测过但不稳的；同组按 id，保证两次导出顺序一致。
    picked.sort((a, b) => (a.attempts === 0 ? 0 : 1) - (b.attempts === 0 ? 0 : 1)
      || a.id.localeCompare(b.id))
  } else {
    picked.sort((a, b) => b.fp - a.fp || a.id.localeCompare(b.id))
  }

  return { total: picked.length, rows: picked.slice(0, ROW_CAP) }
}

function stamp(nowMs) {
  return new Date(nowMs + TZ_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ')
}

function localized(s) {
  const seed = seedIndex()
  const node = seed.nodes[s.id] ?? {}
  const group = node.grp && seed.groups[node.grp] ? seed.groups[node.grp].label : ''
  return {
    subject: seed.subjects[node.subject || s.subject] || (s.subject === 'other' ? '其他' : s.subject),
    group: group || '—',
    label: node.label || s.id,
    method: node.method || node.core || '—',
    trap: node.trap || '',
  }
}

function rowHtml(s) {
  const t = localized(s)
  const why = s.why ? ' <span class="why">' + escapeHtml(s.why) + '</span>' : ''
  return '<tr>'
    + '<td>' + escapeHtml(t.subject) + '</td>'
    + '<td>' + escapeHtml(t.group) + '</td>'
    + '<td class="name" data-id="' + escapeHtml(s.id) + '">' + escapeHtml(t.label) + why + '</td>'
    + '<td>' + escapeHtml(t.method) + '</td>'
    + '<td class="chk">&#9744;</td><td class="chk">&#9744;</td><td class="chk">&#9744;</td>'
    + '</tr>'
}

const HEAD_HTML = '<tr><th>学科</th><th>块</th><th>考点</th><th>方法判据</th>'
  + '<th class="chk">复</th><th class="chk">推</th><th class="chk">错</th></tr>'

/** 一页 HTML。扁平：只有黑白线与字，没有渐变、没有半透明大色块。 */
export function renderHtml(opts) {
  const { what, subject, nowMs, rev, total, rows } = opts
  const subjectName = subject ? (seedIndex().subjects[subject] || subject) : '全部'
  const meta = [stamp(nowMs) + '（+08:00）', '学科：' + subjectName, '共 ' + total + ' 条',
    '投影 rev ' + rev].join(' · ')
  const body = rows.length
    ? rows.map(rowHtml).join('\n')
    : '<tr><td class="empty" colspan="7">这一栏今天没有条目。</td></tr>'
  const more = total > rows.length
    ? '<p class="more">另有 ' + (total - rows.length) + ' 条未列入本页（单页上限 ' + ROW_CAP + ' 条）。</p>'
    : ''

  return '<!doctype html>\n'
    + '<html lang="zh-CN"><head><meta charset="utf-8">'
    + '<title>Neuro-Loop · ' + escapeHtml(TITLE[what]) + '</title>'
    + '<style>\n'
    + '@page { size: A4 portrait; margin: 12mm; }\n'
    + 'html, body { background: #fff; color: #000; }\n'
    + 'body { margin: 0; font: 11px/1.45 "Microsoft YaHei", "Noto Sans SC", sans-serif; }\n'
    + 'h1 { margin: 0 0 2px; font-size: 15px; font-weight: 700; letter-spacing: .5px; }\n'
    + '.meta, .hint, .more { margin: 0 0 6px; font-size: 10px; color: #333; }\n'
    + '.hint { color: #555; }\n'
    + 'table { width: 100%; border-collapse: collapse; }\n'
    + 'th, td { border: 1px solid #000; padding: 3px 4px; text-align: left; vertical-align: top; }\n'
    + 'th { font-weight: 700; }\n'
    + 'td.chk, th.chk { width: 8mm; text-align: center; }\n'
    + 'td.name { font-weight: 700; }\n'
    + '.why { font-weight: 400; font-size: 9px; color: #555; }\n'
    + 'td.empty { text-align: center; color: #555; padding: 10px 0; }\n'
    + 'footer { margin-top: 6px; font-size: 9px; color: #333; }\n'
    + 'thead { display: table-header-group; }\n'
    + 'tr { break-inside: avoid; }\n'
    + '@media print { body { margin: 0; } }\n'
    + '</style></head><body>\n'
    + '<h1>' + escapeHtml(TITLE[what]) + '</h1>\n'
    + '<p class="meta">' + escapeHtml(meta) + '</p>\n'
    + '<p class="hint">' + escapeHtml(HINT[what]) + '　勾选框：复=复习过 · 推=今天再推一遍 · 错=记进错题。</p>\n'
    + '<table><thead>' + HEAD_HTML + '</thead><tbody>\n'
    + body + '\n</tbody></table>\n'
    + more + '\n'
    + '<footer>Neuro-Loop 只读导出 · 不写库 · /neuroloop/export?what=' + escapeHtml(what) + '</footer>\n'
    + '</body></html>'
}

/** 路由：守卫 → 参数校验 → 取数 → 排字。业务判定都在 collect() 里。 */
export function onExport(req, res) {
  if (denyMethod(req, res, 'GET')) return
  if (deny(req, res)) return

  const url = new URL(req.url, 'http://127.0.0.1')
  const fmt = url.searchParams.get('format') || ''
  if (fmt && fmt !== 'html') return fail(res, 400, 'bad-format')

  const what = url.searchParams.get('what') || ''
  if (!WHATS.includes(what)) return fail(res, 400, 'bad-what')

  const subject = url.searchParams.get('subject') || ''
  if (subject && !SUBJECTS.includes(subject)) return fail(res, 400, 'bad-subject')

  try {
    const s = getState()
    const nowMs = Date.now()
    const out = collect(s, what, subject, nowMs)
    writeHtml(res, 200, renderHtml({ what, subject, nowMs, rev: s.rev, total: out.total, rows: out.rows }))
  } catch (err) {
    fail(res, 500, 'export-failed', String(err && err.message))
  }
}
