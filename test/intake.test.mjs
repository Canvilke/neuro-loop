// 票单入口（intake）的回归：外面的一句话能不能稳定变成一张能验收的票。
// 重点不是"能开票"，而是：重复不重复开、验收缺了要拒绝、总线里的请求能被收进来。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-intake-'))
process.env.NEUROLOOP_BUS_ROOT = tmp

const { intake, fromBus } = await import('../tools/intake.mjs')
const { board, create } = await import('../host/team.js')
const bus = await import('../tools/bus.mjs')

let checks = 0
function ok(cond, why) {
  checks += 1
  if (!cond) throw new Error('FAIL ' + why)
}
function throws(fn, want) {
  try {
    fn()
  } catch (err) {
    ok(String(err && err.message).includes(want), 'should throw ' + want + ', got ' + (err && err.message))
    return
  }
  throw new Error('FAIL expected throw ' + want)
}

const root = tmp
fs.mkdirSync(path.join(root, 'team'), { recursive: true })
fs.writeFileSync(path.join(root, 'team', 'tickets.jsonl'), '')

// 1. 开票
const a = intake({ title: '控制台头部显示总线未读', role: 'ui-dev', accept: ['头部三条未读'], scope: ['src/14-team.js'], from: 'lead' }, root)
ok(a.ok && !a.existing && a.ticket.id === 'T-0001', 'opens T-0001')

// 2. 同名未完成票不重复开
const b = intake({ title: '控制台头部显示总线未读', role: 'ui-dev', accept: ['x'] }, root)
ok(b.existing === true, 'dedupes by title')
ok(board(root).tickets.length === 1, 'no duplicate ticket')

// 3. 验收标准必填
throws(() => intake({ title: '没验收的票', role: 'ui-dev' }, root), 'accept-required')

// 4. 角色必须存在
throws(() => intake({ title: '角色不存在', role: 'nobody', accept: ['x'] }, root), 'bad-role')

// 5. 标题过长
throws(() => intake({ title: 'x'.repeat(130), role: 'ui-dev', accept: ['x'] }, root), 'title-too-long')

// 6. 开票会写一条 repo 总线行
const repoLines = bus.view(root).msgs.filter((m) => m.lane === 'repo')
ok(repoLines.length === 1 && repoLines[0].ref === 'T-0001', 'writes repo bus line with ref')

// 7. 总线里的微信请求能被收成票（并 ack 掉原件）
bus.post({ lane: 'wx', from: 'wechat', to: 'lead', text: '英语页改成 30 条/天' }, root)
const r = fromBus({ lane: 'wx' }, root)
ok(r.made.length === 1, 'intake from bus makes one ticket')
ok(board(root).tickets.some((t) => t.id === r.made[0].id && t.title.includes('英语页')), 'ticket carries request text')
ok(bus.pending(root).wx === 0, 'request acked after intake')

// 8. 已完成票不挡同名新票
const done = board(root).tickets.find((t) => t.id === 'T-0001')
create(root, { title: '另一张', role: 'qa', accept: ['x'] })
const { update } = await import('../host/team.js')
update(root, { id: 'T-0001', action: 'claim', by: 'x' })
update(root, { id: 'T-0001', action: 'complete', by: 'x', note: 'done' })
const again = intake({ title: '控制台头部显示总线未读', role: 'ui-dev', accept: ['再开一次'] }, root)
ok(!again.existing && again.ticket.id !== 'T-0001', 'completed title can be reopened')
ok(!!done, 'sanity: found T-0001 before closing')

console.log(`intake ok — ${checks} checks`)
