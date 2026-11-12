// 会议室：存储层与 CLI 的一致性 + 校验边界。
// 只测"写进去能按原样读回、坏输入被挡住、ask→decision 能解阻"，不测界面。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openAsks, post, read, roomPath, view } from '../host/room.js'
import { run as cliRun } from '../tools/room.mjs'

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

console.log('room ok — ' + pass + ' checks')
