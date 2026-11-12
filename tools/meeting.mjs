#!/usr/bin/env node
/**
 * tools/meeting.mjs —— 夜间议事会的"议程"与"出席书"。
 *
 * 为什么需要它：
 *   会议室已经是共享黑板，但"开会"还需要两样东西——今天议什么、以及被派来的子代理该说什么。
 *   这两样都不能靠人临场编，否则每次质量漂移；所以由脚本从票单/总线/会议室里读出现状，生成固定格式。
 *
 * 用法：
 *   node tools/meeting.mjs agenda                  # 打印议程（并往会议室发一条 [会议] 召集）
 *   node tools/meeting.mjs brief --role core-dev   # 打印某个专员的出席书（喂给子代理）
 *   node tools/meeting.mjs close                   # 会后收口：把结论写成一条 say
 *
 * 纪律：议事阶段**只读代码**。子代理不许改文件、不许 claim 票；会后由 Lead 开票或派活。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openAsks, read as roomRead, view as roomView, post as roomPost } from '../host/room.js'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (!a.startsWith('--')) { out._.push(a); continue }
    out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
  }
  return out
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

function roles(root) {
  const r = readJson(path.join(root, 'team', 'roles.json'), null)
  return (r && Array.isArray(r.roles) ? r.roles : []).map((x) => x.id || x.role || x)
}

function tickets(root) {
  const ledger = path.join(root, 'team', 'tickets.jsonl')
  if (!fs.existsSync(ledger)) return []
  const rows = []
  for (const line of fs.readFileSync(ledger, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
  }
  // 重放出当前状态（create/claim/complete/block/reopen 追加式）
  const map = new Map()
  for (const r of rows) {
    if (!r || !r.id) continue
    const cur = map.get(r.id) || { id: r.id, title: '', role: '', scope: [] }
    // 台账字段是 ev（不是 op），时间字段是 t：与 tools/ticket.mjs 保持一致
    const ev = r.ev || r.op
    if (ev === 'create') Object.assign(cur, { title: r.title, role: r.role, scope: r.scope || [], accept: r.accept, deps: r.deps || [] })
    if (ev === 'claim') Object.assign(cur, { status: 'claimed', by: r.by, at: r.t })
    if (ev === 'complete') Object.assign(cur, { status: 'done', note: r.note })
    if (ev === 'block') Object.assign(cur, { status: 'blocked', note: r.note })
    if (ev === 'reopen') Object.assign(cur, { status: 'ready' })
    map.set(r.id, cur)
  }
  return [...map.values()].filter((t) => t.title)
}

export function agenda(root = ROOT) {
  const room = roomRead(root)
  const asks = openAsks(room.rows)
  const ts = tickets(root)
  const ready = ts.filter((t) => !t.status || t.status === 'ready')
  const claimed = ts.filter((t) => t.status === 'claimed')
  const blocked = ts.filter((t) => t.status === 'blocked')
  const recent = roomView(root, { limit: 8 }).msgs

  const lines = []
  lines.push('# 夜间议事 · ' + new Date().toISOString().slice(11, 16))
  lines.push('')
  lines.push('## 待拍板（Lead 需带结论来）')
  lines.push(asks.length ? asks.map((a) => `- ${a.id}  ${a.from}: ${a.text}`).join('\n') : '- 无')
  lines.push('')
  lines.push('## 手上有票（claimed，会上只同步进度，不评审代码）')
  lines.push(claimed.length ? claimed.map((t) => `- ${t.id} ${t.role}  ${t.title}（${t.by || '?'}）`).join('\n') : '- 无')
  lines.push('')
  lines.push('## 可派（ready）')
  lines.push(ready.length ? ready.map((t) => `- ${t.id} ${t.role}  ${t.title}`).join('\n') : '- 无')
  lines.push('')
  lines.push('## 卡住（blocked，会上要给出出路或删票）')
  lines.push(blocked.length ? blocked.map((t) => `- ${t.id} ${t.role}  ${t.title}｜${t.note || ''}`).join('\n') : '- 无')
  lines.push('')
  lines.push('## 上一次会议之后说的话（最近 8 条）')
  lines.push(recent.length ? recent.map((m) => `- ${m.kind === 'ask' ? '[问]' : m.kind === 'decision' ? '[决]' : '[说]'} ${m.from}: ${m.text}`).join('\n') : '- 无')
  return { text: lines.join('\n'), asks, ready, claimed, blocked }
}

export function convene(root = ROOT) {
  const a = agenda(root)
  if (!a.ready.length && !a.claimed.length && !a.asks.length && !a.blocked.length) {
    console.log('（无议题，不召集）')
    return 0
  }
  const rec = roomPost({ from: 'lead', role: 'architect', kind: 'say', text: '【会议】开始。议题见票单与待拍板；只讲话，不动代码。' }, root)
  console.log(a.text)
  console.log(`\n（已在会议室召集：${rec.id}）`)
  return 0
}

export function brief(role, root = ROOT) {
  const known = roles(root)
  if (known.length && !known.includes(role)) {
    return { code: 3, text: `未知角色：${role}（可用：${known.join(' / ')}）` }
  }
  const a = agenda(root)
  const rolejson = readJson(path.join(root, 'team', 'roles.json'), { roles: [] })
  const def = (rolejson.roles || []).find((r) => (r.id || r.role) === role) || {}
  const mine = a.claimed.filter((t) => t.role === role).concat(a.ready.filter((t) => t.role === role))

  const out = []
  out.push(`# 出席书 · ${role}`)
  out.push('')
  out.push('你是被派来开会的代表，不是来写代码的。整场只做三件事：读、说、回去转述。')
  out.push('')
  out.push('## 你的块')
  out.push(`- 负责目录：${(def.owns || []).join('、') || '（未定义）'}`)
  out.push(`- 完成标准：${def.done || '（未定义）'}`)
  out.push(`- 红线：${def.never || '（未定义）'}`)
  out.push('')
  out.push('## 你名下的票')
  out.push(mine.length ? mine.map((t) => `- ${t.id}（${t.status || 'ready'}）${t.title}`).join('\n') : '- 无')
  out.push('')
  out.push('## 议程')
  out.push(a.text)
  out.push('')
  out.push('## 规矩（硬性）')
  out.push('1. **不许改任何文件**，不许 claim/done 票，不许 git 操作。')
  out.push(`2. 发言最多 3 条，每条 ≤200 字，用：\`node tools/room.mjs say --from ${role} --role ${role} --text "..."\``)
  out.push('3. 只说三件事：你这块现在卡在哪、你建议下一步做什么、有没有必须用户拍板的。')
  out.push('4. 说完就停，返回三行摘要（结论 / 依据 / 需要 Lead 做什么），不要复述议程。')
  return { code: 0, text: out.join('\n') }
}

export function run(argv, root = ROOT) {
  const args = parseArgs(argv)
  const cmd = args._[0]
  if (cmd === 'agenda') { console.log(agenda(root).text); return 0 }
  if (cmd === 'convoke') return convene(root)
  if (cmd === 'brief') {
    if (!args.role || args.role === true) { console.error('缺少 --role'); return 2 }
    const r = brief(args.role, root)
    if (r.code) {
      console.error(r.text)
      return r.code
    }
    console.log(r.text)
    return 0
  }
  if (cmd === 'close') {
    const text = args.text && args.text !== true ? args.text : '【会议】散会；结论已落票。'
    roomPost({ from: 'lead', role: 'architect', kind: 'say', text }, root)
    console.log('已收口：' + text)
    return 0
  }
  console.error('用法：node tools/meeting.mjs <agenda|convoke|brief --role X|close --text ...>')
  return 2
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(run(process.argv.slice(2)))
}
