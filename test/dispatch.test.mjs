// 票单命令行（tools/ticket.mjs）的测试：调度纪律能不能被命令强制住。
// 关键断言：没有票不能领；依赖没完不能领；brief 必须带红线与"不要自己标完成"。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, briefOf, scopeOverlap, conflictsOf } from '../tools/ticket.mjs';
import { board, create } from '../host/team.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let pass = 0;
const fails = [];

function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ok    ' + msg);
  } else {
    fails.push(msg);
    console.error('  FAIL  ' + msg);
  }
}

function tmpRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-team-'));
  fs.mkdirSync(path.join(dir, 'team'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'team', 'roles.json'), path.join(dir, 'team', 'roles.json'));
  return dir;
}

// 静音 run 的输出，只留返回值
function quiet(fn) {
  const old = console.log;
  const oldErr = console.error;
  const lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  console.error = (...a) => lines.push(a.join(' '));
  try {
    const code = fn();
    return { code, out: lines.join('\n') };
  } finally {
    console.log = old;
    console.error = oldErr;
  }
}

/* ── 1. 空台账：next 必须拒绝 ─────────────────────────────────────────────── */
{
  const root = tmpRoot();
  const r = quiet(() => run(['next', '--role', 'qa'], root));
  ok(r.code === 3, '空台账 next → 退出码 3（没有票不能开工）');
  ok(/没有可领的票/.test(r.out), '空台账提示可读');
}

/* ── 2. 开票 / 列表 / next 选中最早的一张 ─────────────────────────────────── */
{
  const root = tmpRoot();
  const r1 = quiet(() => run(['new', '--role', 'core-dev', '--title', '写 metrics 的边界'], root));
  const r2 = quiet(() => run(['new', '--role', 'qa', '--title', '补一条回归'], root));
  ok(r1.code === 0 && r2.code === 0, '两张票都开成功');
  ok(/T-0001/.test(r1.out) && /T-0002/.test(r2.out), 'id 递增 T-0001 / T-0002');

  const list = quiet(() => run(['list'], root));
  ok(/ready 2/.test(list.out), 'list 显示 2 张可领');
  ok(/T-0001/.test(list.out) && /T-0002/.test(list.out), 'list 列出两张票');

  const n = quiet(() => run(['next', '--role', 'qa'], root));
  ok(n.code === 0 && n.out.trim() === 'T-0002', 'next --role qa 只挑 qa 的票（T-0002）');
}

/* ── 3. 依赖未完成 → 不可领；claim 报 deps-open ──────────────────────────── */
{
  const root = tmpRoot();
  create(root, { title: '第一张', role: 'core-dev' });
  create(root, { title: '第二张', role: 'qa', deps: ['T-0001'] });

  const b = board(root);
  const t2 = b.tickets.find((t) => t.id === 'T-0002');
  ok(t2.claimable === false, 'board: 依赖未完成时 claimable=false');
  ok(t2.depsOpen.length === 1 && t2.depsOpen[0] === 'T-0001', 'depsOpen 指向 T-0001');

  const claim = quiet(() => run(['claim', 'T-0002', '--by', 'qa-1'], root));
  ok(claim.code === 3 && /deps-open/.test(claim.out), 'claim 被拒：deps-open');
}

/* ── 4. 领票 → 重复领被拒 → 完票后依赖解锁 ───────────────────────────────── */
{
  const root = tmpRoot();
  create(root, { title: '第一张', role: 'core-dev' });
  create(root, { title: '第二张', role: 'qa', deps: ['T-0001'] });

  const c1 = quiet(() => run(['claim', 'T-0001', '--by', 'core-1'], root));
  ok(c1.code === 0 && /claimed/.test(c1.out), 'claim T-0001 成功');

  const c2 = quiet(() => run(['claim', 'T-0001', '--by', 'core-2'], root));
  ok(c2.code === 3 && /already-claimed/.test(c2.out), '重复领被拒：already-claimed');

  const d1 = quiet(() => run(['done', 'T-0001', '--by', 'core-1', '--note', '24/24 + 边界三条'], root));
  ok(d1.code === 0 && /done/.test(d1.out), 'done T-0001 成功');

  const n = quiet(() => run(['next', '--role', 'qa'], root));
  ok(n.out.trim() === 'T-0002', '依赖完成后 T-0002 变成可领');
}

/* ── 5. block 必须写理由 ─────────────────────────────────────────────────── */
{
  const root = tmpRoot();
  create(root, { title: '会被卡住的票', role: 'host-dev' });
  const noNote = quiet(() => run(['block', 'T-0001', '--by', 'h1'], root));
  ok(noNote.code === 3 && /note-required/.test(noNote.out), 'block 不带 --note 被拒');
  const withNote = quiet(() => run(['block', 'T-0001', '--by', 'h1', '--note', '等网'], root));
  ok(withNote.code === 0 && /blocked/.test(withNote.out), 'block 带理由成功');
}

/* ── 6. brief 的内容契约 ─────────────────────────────────────────────────── */
{
  const root = tmpRoot();
  const t = create(root, { title: '把 host 的 405 补上', role: 'host-dev', scope: ['host/', 'test/host.mjs'] });
  const rolesJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'team', 'roles.json'), 'utf8'));
  const roleDef = rolesJson.roles.find((r) => r.id === 'host-dev');
  const text = briefOf(t, roleDef);

  ok(text.includes(t.id) && text.includes('把 host 的 405 补上'), 'brief 带票号与标题');
  ok(text.includes('host/') && text.includes('test/host.mjs'), 'brief 带写入范围');
  ok(/红线/.test(text), 'brief 带红线段');
  ok(text.includes('check_all.ps1'), 'brief 要求跑全量验证');
  ok(/不要自己标完成/.test(text), 'brief 明确"你不要自己标完成"');
  ok(text.includes('claim ' + t.id), 'brief 给出领票命令');
}

/* ── 7. 坏输入不炸：未知命令 / 不存在的票 / 坏角色 ───────────────────────── */
{
  const root = tmpRoot();
  const bad = quiet(() => run(['frobnicate'], root));
  ok(bad.code === 2, '未知命令 → 2');

  const noTicket = quiet(() => run(['brief', 'T-9999'], root));
  ok(noTicket.code === 3, '不存在的票 → 3');

  const badRole = quiet(() => run(['new', '--role', 'intern', '--title', 'x'], root));
  ok(badRole.code === 3 && /bad-role/.test(badRole.out), '坏角色 → bad-role');
}


/* ── 8. 写域冲突：前缀相交要能报出来，兄弟目录不算 ─────────────────────── */
{
  ok(scopeOverlap(['host/'], ['host/http.js']) !== null, 'host/ 与 host/http.js 相交');
  ok(scopeOverlap(['src/'], ['test/']) === null, 'src/ 与 test/ 不相交');
  ok(scopeOverlap(['core'], ['core2/']) === null, 'core 与 core2/ 不算前缀相交（避免 core 吃掉 core2）');
  ok(scopeOverlap(['a/b/'], ['a/b/c/']) !== null, '嵌套目录相交');

  const root = tmpRoot();
  create(root, { title: '占住 host', role: 'host-dev', scope: ['host/'] });
  create(root, { title: '已完成的不算冲突', role: 'qa', scope: ['src/'] });
  const b = board(root);
  const c = conflictsOf(b, ['host/http.js'], null);
  ok(c.length === 1 && c[0].id === 'T-0001', 'conflictsOf 命中未完成的 host 票');
  ok(c[0].status === 'ready', '冲突里带状态');
  ok(conflictsOf(b, ['docs/'], null).length === 0, '不相交时没有冲突');
}

console.log('');
if (fails.length) {
  console.error('dispatch FAILED — ' + fails.length + ' 条未通过');
  process.exit(1);
}
console.log('dispatch ok — ' + pass + ' checks');
