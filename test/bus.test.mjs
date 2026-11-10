// 总线的双向一致性测试：CLI（tools/bus.mjs）写，宿主（host/bus.js）读；
// 以及真实的坏行容忍（半行写入在 append-only 文件里是常态）。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { read as cliRead, view as cliView, post as cliPost, ack as cliAck, run as cliRun, pending, busPath } from '../tools/bus.mjs'
import { read as hostRead, pending as hostPending, recent } from '../host/bus.js'

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-bus-'))
let pass = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('  FAIL  ' + msg)
    process.exit(1)
  }
  pass += 1
  console.log('  ok    ' + msg)
}

/* 1. CLI 写、宿主读：两边必须看到同一条 */
const rec = cliPost({ lane: 'sub', from: 'ui-agent', to: 'lead', text: 'T-0003 完成', ref: 'T-0003' }, ROOT)
ok(/^[0-9a-z]{12}$/.test(rec.id), 'CLI 投递生成 12 位 id（' + rec.id + '）')
const h = hostRead(ROOT)
ok(h.rows.length === 1 && h.rows[0].id === rec.id, '宿主读到 CLI 写的那一条')
ok(h.rows[0].ref === 'T-0003' && h.rows[0].lane === 'sub', '宿主读回 lane/ref')

/* 2. 未读计数与收件人过滤 */
ok(hostPending(ROOT, 'lead').sub === 1, 'lead 的 sub 未读为 1')
ok(hostPending(ROOT, 'other').sub === 0, '别人的收件箱不受影响')
ok(recent(ROOT, { to: 'lead', limit: 5 }).length === 1, '按收件人取最近消息')
ok(recent(ROOT, { to: 'nobody', limit: 5 }).length === 0, '收件人过滤生效')

/* 3. ack 只追加、不改历史 */
const before = fs.readFileSync(busPath(ROOT), 'utf8').split('\n').filter(Boolean).length
cliAck([rec.id], { by: 'lead' }, ROOT)
const after = fs.readFileSync(busPath(ROOT), 'utf8').split('\n').filter(Boolean).length
ok(after === before + 1, 'ack 是追加一行，不是改写')
ok(pending(ROOT, 'lead').sub === 0, 'ack 后未读归零')
const rows2 = cliRead(ROOT).rows
ok(rows2[0].text === 'T-0003 完成', '原消息内容未被改动')

/* 4. 三条 lane 都能走；未知 lane 拒绝 */
cliPost({ lane: 'repo', from: 'lead', to: 'lead', text: 'commit 33af631' }, ROOT)
cliPost({ lane: 'wx', from: 'lead', to: 'wx', text: '今晚 22:40 出纸' }, ROOT)
const counts = pending(ROOT, 'lead')
ok(counts.repo === 1, 'repo lane 可投递')
let threw = false
try {
  cliPost({ lane: 'nope', text: 'x' }, ROOT)
} catch {
  threw = true
}
ok(threw, '未知 lane 抛错')

/* 5. 坏行容忍：截断行只计数 */
fs.appendFileSync(busPath(ROOT), '{"id":"broken', 'utf8')
const h3 = hostRead(ROOT)
ok(h3.bad === 1, '坏行计入 bad（实际 ' + h3.bad + '）')
ok(cliView(ROOT).msgs.length === 3, '好行仍然读得出来（' + cliView(ROOT).msgs.length + ' 条消息）')

/* 6. CLI 入口：out 走 wx lane，tail 能打印 */
const out = cliRun(['out', '--from', 'lead', '--text', '明早七点的两张纸'], ROOT)
ok(out === 0, 'CLI out 返回 0')
const wxq = pending(ROOT, 'wx').wx
ok(wxq === 2, 'wx 待发队列累计到 2（实际 ' + wxq + '）')
const tail = cliRun(['tail', '--lane', 'wx', '--limit', '5'], ROOT)
ok(tail === 0, 'CLI tail 返回 0')

/* 7. 空文本与超长文本 */
threw = false
try {
  cliPost({ lane: 'note', text: '  ' }, ROOT)
} catch {
  threw = true
}
ok(threw, '空正文拒绝')
threw = false
try {
  cliPost({ lane: 'note', text: 'x'.repeat(4001) }, ROOT)
} catch {
  threw = true
}
ok(threw, '超长正文拒绝（>4000）')

console.log(`bus ok — ${pass} checks (cli+host parity, ack, lanes, bad lines)`)
process.exit(0)
