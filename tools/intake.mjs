#!/usr/bin/env node
/**
 * intake.mjs — 把"外面的请求"变成"台账上的票"。
 *
 * 为什么需要它：superagent（主理鱼）盯 issue、微信进来一句话、我自己想起来一件事，
 * 这三件事的形态不同，但落到项目里都该是**一张有验收标准的票**。没有这一步，
 * 讨论就停在对话里，明天醒来什么都不剩。
 *
 * 用法：
 *   node tools/intake.mjs new --title "路由统一外壳" --role host-dev \
 *        --accept "所有 /neuroloop/* 返回 {ok,data,rev}; docs 更新" --scope index.js host/ --from issue --ref "#12"
 *   node tools/intake.mjs from-bus --lane wx --limit 5            # 把总线里未读请求开成票
 *   node tools/intake.mjs list
 *
 * 纪律：
 *   - 标题去重：已有未完成票用同名标题时不重复开票（返回 existing）。
 *   - 只写台账（tickets.jsonl）与总线（repo 行），不碰代码。
 *   - 验收标准必填：写不出"怎样算做完"的请求，先别开票。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { board, create, roles } from '../host/team.js'
import { post as busPost, view as busView, ack as busAck } from './bus.mjs'

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export function parseArgs(argv) {
  const [cmd, ...rest] = argv
  const opts = { _: [] }
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = rest[i + 1]
      if (next && !next.startsWith('--')) {
        opts[key] = next
        i += 1
      } else opts[key] = true
    } else opts._.push(a)
  }
  return { cmd, opts }
}

function splitList(v) {
  if (v === undefined || v === true) return []
  return String(v)
    .split(/[;,\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
}

function openTitles(root) {
  const b = board(root)
  return new Set(b.tickets.filter((t) => t.status !== 'done').map((t) => t.title))
}

export function intake(draft, root = ROOT) {
  const title = String(draft.title || '').trim()
  if (!title) throw new Error('title-required')
  if (title.length > 120) throw new Error('title-too-long')
  if (!draft.role) throw new Error('role-required')
  const known = roles(root).roles.map((r) => r.id) // roles() 返回 {version, roles:[…]}
  if (!known.includes(draft.role)) throw new Error('bad-role')
  const accept = Array.isArray(draft.accept) ? draft.accept : splitList(draft.accept)
  if (accept.length === 0) throw new Error('accept-required')

  if (openTitles(root).has(title)) return { ok: true, existing: true, title }

  const ticket = create(root, {
    title,
    role: draft.role,
    scope: Array.isArray(draft.scope) ? draft.scope : splitList(draft.scope),
    deps: draft.deps ? (Array.isArray(draft.deps) ? draft.deps : splitList(draft.deps)) : [],
    accept,
    note: draft.from ? `来源：${draft.from}${draft.ref ? ' ' + draft.ref : ''}` : undefined,
  })
  busPost(
    {
      lane: 'repo',
      from: 'intake',
      to: 'lead',
      text: `开票 ${ticket.id}：${title}（${draft.role}）`,
      ref: ticket.id,
    },
    root,
  )
  return { ok: true, existing: false, ticket }
}

/** 把总线里未读的请求开成票。微信与子代理都走这一条，但默认只看请求方给 lead 的。 */
export function fromBus({ lane = 'wx', limit = 5 } = {}, root = ROOT) {
  const { msgs, acked } = busView(root)
  const queued = msgs.filter((m) => m.lane === lane && m.to === 'lead' && !acked.has(m.id)).slice(-limit)
  const made = []
  const skipped = []
  for (const m of queued) {
    try {
      const r = intake(
        {
          title: m.text.slice(0, 100),
          role: 'host-dev',
          accept: ['按请求完成，并写一条 bus sub 行说明改了什么'],
          from: `${lane}:${m.from}`,
          ref: m.id,
        },
        root,
      )
      if (r.existing) skipped.push(m.id)
      else made.push({ id: r.ticket.id, from: m.id })
      busAck([m.id], { by: 'intake' }, root)
    } catch (err) {
      skipped.push(`${m.id}:${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { made, skipped }
}

function fmt(t) {
  const badge = { ready: '可领', claimed: '在建', blocked: '卡住', done: '完成' }[t.status] || t.status
  return `${t.id}  ${badge}  ${t.role}  ${t.ageH}h  ${t.title}`
}

export function run(argv, root = ROOT) {
  const { cmd, opts } = parseArgs(argv)
  try {
    if (cmd === 'new') {
      const r = intake(
        {
          title: opts.title,
          role: opts.role,
          scope: opts.scope,
          deps: opts.deps,
          accept: opts.accept,
          from: opts.from,
          ref: opts.ref,
        },
        root,
      )
      if (r.existing) process.stdout.write(`exists：同名未完成票已存在，不重复开\n`)
      else process.stdout.write(`opened ${r.ticket.id}  ${r.ticket.title}\n下一步：node tools/ticket.mjs claim ${r.ticket.id} --by <你>\n`)
      return 0
    }
    if (cmd === 'from-bus') {
      const r = fromBus({ lane: opts.lane || 'wx', limit: Number(opts.limit || 5) }, root)
      process.stdout.write(`made ${r.made.length} · skipped ${r.skipped.length}\n`)
      for (const m of r.made) process.stdout.write(`  ${m.id} ← ${m.from}\n`)
      for (const s of r.skipped) process.stdout.write(`  skip ${s}\n`)
      return 0
    }
    if (cmd === 'list') {
      const b = board(root)
      if (b.tickets.length === 0) process.stdout.write('(空)\n')
      else for (const t of b.tickets) process.stdout.write(fmt(t) + '\n')
      process.stdout.write(`ready ${b.counts.ready} / claimed ${b.counts.claimed} / blocked ${b.counts.blocked} / done ${b.counts.done}\n`)
      return 0
    }
    process.stdout.write('usage: intake.mjs new|from-bus|list\n')
    return 2
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    return 3
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(run(process.argv.slice(2)))
}
