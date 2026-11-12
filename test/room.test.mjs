// 会议室：存储层与 CLI 的一致性 + 校验边界。
// 只测"写进去能按原样读回、坏输入被挡住、ask→decision 能解阻"，不测界面。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { openAsks, post, read, roomPath, view } from '../host/room.js'
import { run as cliRun } from '../tools/room.mjs'
import { agenda, convene, run as meetRun } from '../tools/meeting.mjs'

const PROJECT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const ROOM_URL = pathToFileURL(path.join(PROJECT, 'host', 'room.js')).href
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-room-'))
let pass = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('  FAIL  ' + msg)
    process.exit(1)
  }
  pass += 1
  console.log('  ok    ' + msg)
}
function throws(fn, code) {
  try {
    fn()
    return false
  } catch (err) {
    return String(err && err.message) === code
  }
}
// 吞掉被测命令的打印，只留退出码与文本（断言里还要看文案）
function quiet(fn) {
  const keep = { log: console.log, err: console.error }
  const out = []
  console.log = (...a) => out.push(a.join(' '))
  console.error = (...a) => out.push(a.join(' '))
  try {
    return { code: fn(), out: out.join('\n') }
  } finally {
    console.log = keep.log
    console.error = keep.err
  }
}

/* 1. 写读一致 */
const a = post({ from: 'lead', role: 'architect', text: '今晚先收尾 T-0012', kind: 'say' }, ROOT)
ok(/^[0-9a-z]{8,16}$/.test(a.id), '生成 8–16 位 id（' + a.id + '）')
const r1 = read(ROOT)
ok(r1.rows.length === 1 && r1.rows[0].text === '今晚先收尾 T-0012', '读回同一条')
ok(r1.rows[0].role === 'architect' && r1.rows[0].kind === 'say', 'role/kind 保留')

/* 2. 边界：坏 kind / 空文本 / 超长 / 坏 from / decision 缺 ref */
ok(throws(() => post({ from: 'lead', kind: 'nope', text: 'x' }, ROOT), 'bad-kind'), '未知 kind 拒绝')
ok(throws(() => post({ from: 'lead', text: '   ' }, ROOT), 'empty-text'), '空文本拒绝')
ok(throws(() => post({ from: 'lead', text: 'x'.repeat(2001) }, ROOT), 'text-too-long'), '超长拒绝')
ok(throws(() => post({ from: 'Bad Name', text: 'x' }, ROOT), 'bad-from'), '坏 from 拒绝')
ok(throws(() => post({ from: 'lead', kind: 'decision', text: '行' }, ROOT), 'decision-needs-ref'), 'decision 必须带 ref')

/* 3. ask → decision 解阻 */
const ask = post({ from: 'qa', role: 'qa', kind: 'ask', text: '要不要补一条边界回归？' }, ROOT)
ok(openAsks(read(ROOT).rows).length === 1, '未回答的 ask 计入待办')
post({ from: 'lead', role: 'architect', kind: 'decision', text: '补，放在 qa 票里', ref: ask.id }, ROOT)
ok(openAsks(read(ROOT).rows).length === 0, 'decision 之后 ask 不再待办')
ok(read(ROOT).rows.length === 3, 'decision 是追加，不是改写')

/* 4. since / limit */
const v1 = view(ROOT, { limit: 2 })
ok(v1.msgs.length === 2 && v1.msgs[1].kind === 'decision', 'limit 取最近两条')
const v2 = view(ROOT, { since: a.id })
ok(v2.msgs.length === 2, 'since=id 之后的两条')
ok(view(ROOT, { limit: 999 }).msgs.length === 3, 'limit 上限不影响全量')

/* 5. 坏行只计数 */
fs.appendFileSync(roomPath(ROOT), '{"half":1}\nnot-json\n', 'utf8')
const r2 = read(ROOT)
ok(r2.bad === 2, '坏行计数 2')
ok(r2.rows.length === 3, '好行不受影响')

/* 6. CLI 与存储同一条路：say 后能在 tail 里读到 */
const before = read(ROOT).rows.length
const code = cliRun(['say', '--from', 'host-agent', '--role', 'host-dev', '--text', 'T-0014 开工'], ROOT)
ok(code === 0, 'CLI say 退出码 0')
ok(read(ROOT).rows.length === before + 1, 'CLI 写进同一份文件')
ok(cliRun(['decide', '--ref', 'T-9999', '--text', 'x'], ROOT) === 3, 'decide 不存在的 ask 返回 3')
ok(cliRun(['banana'], ROOT) === 2, '未知命令返回 2')

/* 7. wait：没人说话时按时退出，且 --timeout 被夹到 5 秒下界 */
{
  const t0 = Date.now()
  const w1 = quiet(() => cliRun(['wait', '--since', a.id, '--timeout', '0'], ROOT))
  const ms = Date.now() - t0
  ok(w1.code === 4, 'wait 无新消息退出码 4')
  ok(ms >= 4800, '--timeout 0 仍夹到 5 秒下界（实测 ' + ms + 'ms）')
  ok(ms < 12000, '超时后立刻返回，不多等（实测 ' + ms + 'ms）')
  ok(/没有新消息/.test(w1.out), 'wait 超时文案可读')
}

/* 8. wait：别人说话就醒，且只打印新来的 */
{
  const src = String.raw`
const { workerData } = require('node:worker_threads')
const fs = require('node:fs')
const until = Date.now() + 600
while (Date.now() < until) { /* 等主线程进阻塞 */ }
fs.appendFileSync(workerData.file, JSON.stringify({ id: 'laterrun1', at: new Date().toISOString(), from: 'qa', kind: 'say', text: '迟到的消息' }) + '\n')
`
  const w = new Worker(src, { eval: true, workerData: { file: roomPath(ROOT) } })
  const t0 = Date.now()
  const w2 = quiet(() => cliRun(['wait', '--since', a.id, '--timeout', '10'], ROOT))
  const ms = Date.now() - t0
  await w.terminate()
  ok(w2.code === 0, 'wait 等到新消息返回 0')
  ok(/迟到的消息/.test(w2.out), 'wait 打印新来的那条')
  ok(!/今晚先收尾 T-0012/.test(w2.out), 'wait 不复述旧消息')
  ok(ms < 8000, '新消息在下一个轮询周期内送达（实测 ' + ms + 'ms）')
}

/* 9. 并发追加：四个线程各写 25 条，一条不丢、一行不坏 */
{
  const badBefore = read(ROOT).bad
  const before = read(ROOT).rows.length
  const src = String.raw`
const { workerData, parentPort } = require('node:worker_threads')
import(workerData.roomUrl).then(({ post }) => {
  for (let i = 0; i < 25; i += 1) {
    post({ from: 'w' + workerData.n, role: 'qa', kind: 'say', text: '并发 ' + workerData.n + '-' + i }, workerData.root)
  }
  parentPort.postMessage('done')
})
`
  const jobs = [0, 1, 2, 3].map((n) => new Promise((resolve, reject) => {
    const k = new Worker(src, { eval: true, workerData: { root: ROOT, n, roomUrl: ROOM_URL } })
    k.on('message', resolve)
    k.on('error', reject)
  }))
  await Promise.all(jobs)
  const after = read(ROOT)
  ok(after.rows.length === before + 100, '4 线程 × 25 条全部落地（+' + (after.rows.length - before) + '）')
  ok(after.bad === badBefore, '并发写入没有产生坏行')
  ok(new Set(after.rows.map((r) => r.id)).size === after.rows.length, '并发写入 id 无重复')
}

/* 10. 坏行：尾部读不崩，只加计数 */
{
  const badBefore = read(ROOT).bad
  fs.appendFileSync(roomPath(ROOT), '{"almost":true}\n', 'utf8')
  const t1 = quiet(() => cliRun(['tail', '--limit', '3'], ROOT))
  ok(t1.code === 0, '尾部有坏行时 tail 仍返回 0')
  ok(/^\d{2}:\d{2}:\d{2} \[/m.test(t1.out), 'tail 行首是时间与 [说]/[问]/[决] 标签')
  ok(read(ROOT).bad === badBefore + 1, '坏行只加计数，不影响好行')
}

/* 11. 议事脚本：出席书、台账重放、召集与收口 */
{
  const meetRoot = (lines = []) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-meet-'))
    fs.mkdirSync(path.join(dir, 'team'), { recursive: true })
    fs.copyFileSync(path.join(PROJECT, 'team', 'roles.json'), path.join(dir, 'team', 'roles.json'))
    if (lines.length) fs.writeFileSync(path.join(dir, 'team', 'tickets.jsonl'), lines.join('\n') + '\n', 'utf8')
    return dir
  }
  const ev = (o) => JSON.stringify(o)

  const empty = meetRoot()
  ok(quiet(() => meetRun(['brief', '--role', 'nope'], empty)).code === 3, 'brief 未知角色返回 3')
  ok(quiet(() => meetRun(['brief'], empty)).code === 2, 'brief 缺 --role 返回 2')
  const b1 = quiet(() => meetRun(['brief', '--role', 'qa'], empty))
  ok(b1.code === 0 && /出席书 · qa/.test(b1.out), 'brief 给出出席书')
  ok(/红线/.test(b1.out) && /不许改任何文件/.test(b1.out), '出席书带红线与"不许改文件"')
  ok(/发言最多 3 条/.test(b1.out), '出席书给出发言上限')

  const c0 = quiet(() => convene(empty))
  ok(c0.code === 0 && read(empty).rows.length === 0, '无议题时不召集、不写会议室')

  const root = meetRoot([
    ev({ id: 'T-A', ev: 'create', t: '2026-11-13T00:00:00Z', title: '甲的票', role: 'qa', scope: ['test/'], accept: ['一条断言'], deps: [] }),
    ev({ id: 'T-B', ev: 'create', t: '2026-11-13T00:01:00Z', title: '乙的票', role: 'qa' }),
    ev({ id: 'T-B', ev: 'claim', t: '2026-11-13T00:02:00Z', by: 'qa' }),
    ev({ id: 'T-B', ev: 'complete', t: '2026-11-13T00:03:00Z', by: 'qa', note: '收了' }),
    ev({ id: 'T-C', ev: 'create', t: '2026-11-13T00:04:00Z', title: '丙的票', role: 'ui-dev' }),
    ev({ id: 'T-C', ev: 'claim', t: '2026-11-13T00:05:00Z', by: 'ui-dev' }),
    ev({ id: 'T-C', ev: 'reopen', t: '2026-11-13T00:06:00Z' }),
    ev({ id: 'T-D', ev: 'create', t: '2026-11-13T00:07:00Z', title: '丁的票', role: 'host-dev' }),
    ev({ id: 'T-D', ev: 'block', t: '2026-11-13T00:08:00Z', by: 'host-dev', note: '等 T-A 先做' }),
    ev({ id: 'T-E', ev: 'claim', t: '2026-11-13T00:09:00Z', by: 'qa' }),
  ])
  const a2 = agenda(root)
  ok(a2.ready.some((t) => t.id === 'T-C'), 'claim 之后 reopen 回到可派')
  ok(!a2.ready.some((t) => t.id === 'T-B') && !a2.claimed.some((t) => t.id === 'T-B'), '完成的票不占任何栏位')
  ok(a2.blocked.length === 1 && /等 T-A 先做/.test(a2.text), '卡住栏带出原因')
  ok(!a2.ready.some((t) => t.id === 'T-E') && !a2.text.includes('T-E'), '没有 create 的孤儿事件不开票')
  ok(/^# 夜间议事 · \d{2}:\d{2}$/m.test(a2.text), '议程标题带两位时分')

  const c1 = quiet(() => convene(root))
  ok(c1.code === 0 && read(root).rows.length === 1 && /【会议】/.test(read(root).rows[0].text), '有议题时召集并写一条')
  const c2 = quiet(() => meetRun(['close', '--text', '【会议】散会：T-C 归 lead'], root))
  ok(c2.code === 0 && read(root).rows.length === 2 && /散会/.test(read(root).rows[1].text), 'close 把结论写进会议室')
}

console.log('room ok — ' + pass + ' checks')
