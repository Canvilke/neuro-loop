#!/usr/bin/env node
/**
 * tools/room.mjs —— 会议室的命令行（夜间协作的唯一写入路径）。
 *
 * 与 tools/bus.mjs 同一思路：直接写 room/room.jsonl，不依赖宿主是否加载；
 * 宿主侧的 /neuroloop/room 读的是同一份文件，界面刷新即可看到。
 *
 * 用法：
 *   node tools/room.mjs say    --from lead --role architect --text "..." [--ref T-0013]
 *   node tools/room.mjs ask    --from qa --role qa --text "需要拍板：..." [--ref T-0014]
 *   node tools/room.mjs decide --ref <ask-id> --text "决定：做 A" [--from lead]
 *   node tools/room.mjs tail   [--limit 30] [--since <id|ISO>]
 *   node tools/room.mjs asks
 *   node tools/room.mjs wait --since <id> [--timeout 120]   # 阻塞等新消息（代表用这个，省 token）
 *
 * 退出码：0 成功；2 用法错误；3 业务拒绝（无答案的 ref / 未知命令）。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openAsks, post, read, view } from '../host/room.js'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (!a.startsWith('--')) {
      out._.push(a)
      continue
    }
    out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
  }
  return out
}

function fmt(r) {
  const t = String(r.at || '').slice(11, 19)
  const who = r.role ? `${r.from}/${r.role}` : r.from
  const tag = r.kind === 'ask' ? '[问]' : r.kind === 'decision' ? '[决]' : '[说]'
  const ref = r.ref ? `  (${r.ref})` : ''
  return `${t} ${tag} ${who}: ${r.text}${ref}`
}

export function run(argv, root = ROOT) {
  const args = parseArgs(argv)
  const cmd = args._[0]

  if (!cmd || cmd === 'help') {
    console.log('用法：node tools/room.mjs <say|ask|decide|tail|asks> [选项]')
    return 0
  }

  if (cmd === 'say' || cmd === 'ask') {
    if (!args.text || args.text === true) {
      console.error('缺少 --text')
      return 2
    }
    try {
      const rec = post({
        from: args.from || 'lead',
        role: args.role,
        text: args.text,
        kind: cmd === 'ask' ? 'ask' : 'say',
        ref: args.ref,
      }, root)
      console.log(`#${rec.id} ${cmd === 'ask' ? '待拍板' : '已发'}：${rec.text}`)
      return 0
    } catch (err) {
      console.error(String(err && err.message))
      return 3
    }
  }

  if (cmd === 'decide') {
    const ref = args.ref
    if (!ref || ref === true) {
      console.error('缺少 --ref <ask-id>')
      return 2
    }
    const { rows } = read(root)
    if (!rows.some((r) => r.id === ref && r.kind === 'ask')) {
      console.error(`没有这条待拍板：${ref}`)
      return 3
    }
    try {
      const rec = post({ from: args.from || 'lead', text: args.text || '已决定', kind: 'decision', ref }, root)
      console.log(`已决定 ${ref} → #${rec.id}`)
      return 0
    } catch (err) {
      console.error(String(err && err.message))
      return 3
    }
  }

  if (cmd === 'tail') {
    const lim = args.limit ? Number(args.limit) : 30
    const v = view(root, { since: args.since || '', limit: Number.isFinite(lim) ? lim : 30 })
    if (!v.msgs.length) {
      console.log('（会议室是空的）')
      return 0
    }
    for (const r of v.msgs) console.log(fmt(r))
    if (v.open.length) console.log(`\n待拍板 ${v.open.length} 条；用 node tools/room.mjs asks 查看`)
    return 0
  }

  if (cmd === 'wait') {
    const since = args.since && args.since !== true ? String(args.since) : ''
    if (!since) {
      console.error('缺少 --since <id|ISO>')
      return 2
    }
    const secs = Number(args.timeout || 120)
    const deadline = Date.now() + Math.max(5, Math.min(600, Number.isFinite(secs) ? secs : 120)) * 1000
    const before = read(root)
    let prev = before.rows.length
    while (Date.now() < deadline) {
      const now = read(root)
      if (now.rows.length > prev) {
        const fresh = now.rows.slice(prev)
        for (const r of fresh) console.log(fmt(r))
        return 0
      }
      prev = now.rows.length
      const until = Date.now() + 2500
      while (Date.now() < until) { /* 2.5 秒一轮，够快也不烧 CPU */ }
    }
    console.log('（' + Math.round((deadline - Date.now()) / -1000 + 0) + ' 秒内没有新消息）')
    return 4
  }

  if (cmd === 'asks') {
    const { rows } = read(root)
    const list = openAsks(rows)
    if (!list.length) {
      console.log('（没有待拍板的事）')
      return 0
    }
    for (const r of list) console.log(`${r.id}  ${r.from}: ${r.text}`)
    return 0
  }

  console.error(`未知命令：${cmd}`)
  return 2
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(run(process.argv.slice(2)))
}
