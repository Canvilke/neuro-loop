#!/usr/bin/env node
/**
 * tools/ticket.mjs —— 票单命令行（ADR-0002 的执行侧）。
 *
 * 为什么要有它：控制台是给人看的，子代理不能点按钮。
 * 子代理只能跑命令，所以必须有一个"读票 / 领票 / 交付"的命令行，
 * 而且它要能在宿主没起的时候也能用——所以直接走 host/team.js 的纯函数，
 * 不依赖 HTTP，也不依赖 DSH 是否加载了插件。
 *
 * 用法：
 *   node tools/ticket.mjs list [--all]
 *   node tools/ticket.mjs next --role core-dev
 *   node tools/ticket.mjs brief T-0003          # 输出可直接交给子代理的提示词
 *   node tools/ticket.mjs new --role qa --title "..." [--scope a b] [--deps T-0001]
 *   node tools/ticket.mjs claim T-0003 --by lead
 *   node tools/ticket.mjs done  T-0003 --by ui-dev --note "..." [--accept 1,3]
 *   node tools/ticket.mjs block T-0003 --by host-dev --note "为什么卡住"
 *   node tools/ticket.mjs reopen T-0003 --note "..."
 *
 * 退出码：0 成功；2 用法错误；3 业务拒绝（deps-open / already-claimed …）。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { board, create, update, roles } from '../host/team.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function parseArgs(argv) {
  const out = { _: [] };
  const listKeys = new Set(['scope', 'deps', 'accept']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const k = a.slice(2);
    const v = argv[i + 1];
    if (listKeys.has(k)) {
      const arr = [];
      let j = i + 1;
      while (j < argv.length && !argv[j].startsWith('--')) {
        arr.push(argv[j]);
        j++;
      }
      out[k] = arr;
      i = j - 1;
    } else if (v === undefined || v.startsWith('--')) {
      out[k] = true;
    } else {
      out[k] = v;
      i++;
    }
  }
  return out;
}

/** 两个写域是否有交集（前缀互相包含即视为相交）。 */
export function scopeOverlap(a = [], b = []) {
  const norm = (x) => String(x).replace(/\\/g, '/').replace(/\/+$/, '');
  for (const x of a) {
    for (const y of b) {
      const p = norm(x);
      const q = norm(y);
      if (!p || !q) continue;
      if (p === q || p.startsWith(q + '/') || q.startsWith(p + '/')) return [p, q];
    }
  }
  return null;
}

/** 找出一张票与当前未完成票的写域冲突。 */
export function conflictsOf(boardObj, scope = [], selfId = null) {
  const out = [];
  for (const t of boardObj.tickets) {
    if (t.status === 'done' || t.id === selfId) continue;
    const hit = scopeOverlap(scope, t.scope);
    if (hit) out.push({ id: t.id, a: hit[0], b: hit[1], status: t.status });
  }
  return out;
}

/** 把票渲染成一段可直接塞给子代理的提示词。 */
export function briefOf(t, roleDef) {
  const L = [];
  L.push('# 票单 ' + t.id + ' · ' + t.title);
  L.push('');
  L.push('你是这个仓库的「' + roleDef.name + '」（' + t.role + '）。');
  L.push('仓库根：' + ROOT);
  L.push('');
  L.push('## 只碰这些');
  const scope = (t.scope && t.scope.length ? t.scope : roleDef.owns) || [];
  L.push(scope.length ? scope.map((s) => '- ' + s).join('\n') : '- （未指定，按角色红线自行收窄，并在交付里说明）');
  L.push('');
  L.push('## 做完要满足');
  const acc = t.accept && t.accept.length ? t.accept : (roleDef.done || []);
  L.push(acc.length ? acc.map((s) => '- ' + s).join('\n') : '- 测试全绿、文档同步');
  L.push('');
  L.push('## 红线');
  L.push(((roleDef.never || []).length ? roleDef.never : ['不删用户数据', '不装依赖']).map((s) => '- ' + s).join('\n'));
  L.push('');
  L.push('## 交付方式（必须按顺序做完）');
  L.push('1. 在改动前先跑 `node tools/ticket.mjs claim ' + t.id + ' --by <你的名字>`；');
  L.push('2. 写代码 / 文档，只动上面列出的范围；');
  L.push('3. 跑验证：`powershell -File tools/check_all.ps1`（必须全绿）；');
  L.push('4. 交付时在回复里写三行：**改了什么 / 证据（测试输出行）/ 没做什么**；');
  L.push('5. 由 Lead 复核后 `node tools/ticket.mjs done ' + t.id + ' --by <名字> --note "..."`，你不要自己标完成。');
  L.push('');
  L.push('## 背景');
  L.push('先读 `AGENTS.md`、`docs/ADR-0002-persistent-team.md`、`NEXT.md` 顶部三行。');
  L.push('不要重写未涉及的文件；不要为了让测试通过而改断言。');
  return L.join('\n');
}

function fmt(t) {
  const flags = [];
  if (t.claimable) flags.push('可领');
  if (t.stale) flags.push('卡住>' + t.ageH + 'h');
  if (t.depsOpen && t.depsOpen.length) flags.push('等 ' + t.depsOpen.join(','));
  return [
    t.id.padEnd(7),
    t.status.padEnd(8),
    t.role.padEnd(10),
    String(t.ageH).padStart(5) + 'h',
    t.title + (flags.length ? '  [' + flags.join(' · ') + ']' : ''),
  ].join('  ');
}

export function run(argv, root = ROOT) {
  const a = parseArgs(argv);
  const cmd = a._[0];
  const b = board(root);

  if (!cmd || cmd === 'list') {
    const rows = a.all ? b.tickets : b.tickets.filter((t) => t.status !== 'done');
    const byStatus = { claimed: 0, ready: 0, blocked: 0, done: 0 };
    for (const t of b.tickets) byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    console.log(
      'ready ' + b.counts.ready + ' / claimed ' + b.counts.claimed + ' / blocked ' +
      b.counts.blocked + ' / done ' + b.counts.done + '   (stale ' + b.stale.length + ')',
    );
    if (!rows.length) {
      console.log('（没有票。开工前先 `node tools/ticket.mjs new ...`）');
      return 0;
    }
    for (const t of rows) console.log(fmt(t));
    return 0;
  }

  if (cmd === 'next') {
    const role = a.role;
    const pool = b.tickets.filter((t) => t.claimable && (!role || t.role === role));
    if (!pool.length) {
      console.log('没有可领的票' + (role ? '（角色 ' + role + '）' : '') + '。');
      return 3;
    }
    pool.sort((x, y) => x.id.localeCompare(y.id));
    console.log(pool[0].id);
    return 0;
  }

  if (cmd === 'brief') {
    const id = a._[1];
    const t = b.tickets.find((x) => x.id === id);
    if (!t) {
      console.error('没有这张票：' + id);
      return 3;
    }
    const roleDef = (roles(root).roles || []).find((r) => r.id === t.role) || { name: t.role, owns: [], done: [], never: [] };
    console.log(briefOf(t, roleDef));
    return 0;
  }

  if (cmd === 'new') {
    try {
      const t = create(root, {
        title: a.title,
        role: a.role,
        scope: a.scope,
        deps: a.deps,
        accept: a.accept,
      });
      console.log('开票 ' + t.id + ' · ' + t.title + '（role ' + t.role + '）');
      const conflicts = conflictsOf(board(root), t.scope, t.id);
      if (conflicts.length) {
        for (const c of conflicts) {
          console.error('  警告：写域与 ' + c.id + '（' + c.status + '）重叠 ' + c.a + ' ↔ ' + c.b + ' —— 并行施工前先切分目录');
        }
      }
      return 0;
    } catch (e) {
      console.error('开票失败：' + e.code + ' ' + e.message);
      return 3;
    }
  }

  if (['claim', 'done', 'block', 'reopen'].includes(cmd)) {
    const id = a._[1];
    const action = cmd === 'done' ? 'complete' : cmd;
    try {
      const t = update(root, { id, action, by: a.by, note: a.note });
      console.log(id + ' → ' + t.status + (t.note ? '（' + t.note + '）' : ''));
      return 0;
    } catch (e) {
      console.error('拒绝：' + e.code + ' ' + e.message);
      return 3;
    }
  }

  console.error('未知命令：' + cmd);
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exit(run(process.argv.slice(2)));
}
