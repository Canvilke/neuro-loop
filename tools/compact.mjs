#!/usr/bin/env node
/**
 * tools/compact.mjs —— 按月折叠事件流（L1 的维护命令）。
 *
 * 用法：
 *   node tools/compact.mjs                        # 只出计划（dry-run），不动任何文件
 *   node tools/compact.mjs --month 2026-10        # 只处理 2026-10
 *   node tools/compact.mjs --before 2026-11       # 处理 2026-11 之前的完整月份
 *   node tools/compact.mjs --apply                # 真的写快照 + 归档（受下面的安全闸约束）
 *   node tools/compact.mjs --json                 # 机器可读输出
 *
 * 它做什么：
 *   1) 把某月（含）之前的事件折成 snapshot-YYYY-MM.json —— 累计前缀态，不是月内增量；
 *   2) 写盘后**从磁盘读回**，与写前内存态逐字节比对，不一致立刻中止；
 *   3) 比对通过才把 events-YYYY-MM.jsonl.gz 压进 archive/，再删掉根目录那份。
 *   重复跑是幂等的：已经折叠过的月份不会再写一次。
 *
 * 安全闸（都是为了不丢数据）：
 *   - 只折叠**已经结束的月份**。当月还在写，折进去会把后面的事件吃掉。
 *   - archive/ 里已有同月文件时拒绝覆盖（宁可报错，也不猜哪份是对的）。
 *   - --apply 默认被投影层挡住：host/service.js:40 与 storage/projection.js 仍拿 events.length
 *     当 rev，接了归档以后重建只会看到尾部，账目会少算。等 T-0022 落地，或者明确加
 *     --allow-projection-gap 自己承担这个缺口。
 *
 * 退出码：0 完成（含"无事可做"）；2 被安全闸拒绝；1 其它错误。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { baseState, equalState, isMonth, monthOfAt, snapshotFromState } from '../core/compact.js';
import { DomainError, check } from '../core/contract.js';
import { applyEvent, emptyState } from '../core/state.js';
import {
  archiveMonth, listArchives, listFiles, readAll, readMonth, readSnapshot, rootDir, writeSnapshot,
} from '../storage/events.js';
import { monthOfFile } from '../core/compact.js';

const USAGE = `用法：node tools/compact.mjs [--month YYYY-MM] [--before YYYY-MM] [--apply] [--json]

  （无参数）     只出计划，不动文件
  --month M      只处理 M 这一个月
  --before M     处理早于 M 的所有完整月份
  --apply        真的执行（写快照 → 回读校验 → gzip 归档）
  --json         机器可读输出
  --allow-projection-gap
                 明确跳过"投影层还拿 events.length 当 rev"这道闸（见 T-0022）
  --help         这份说明`;

/**
 * 解析命令行。
 * @param {string[]} argv
 * @returns {{month:string|null, before:string|null, apply:boolean, json:boolean, allowProjectionGap:boolean, help:boolean}}
 */
export function parseArgs(argv) {
  const out = {
    month: null, before: null, apply: false, json: false, allowProjectionGap: false, help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--apply') out.apply = true;
    else if (a === '--json') out.json = true;
    else if (a === '--allow-projection-gap') out.allowProjectionGap = true;
    else if (a === '--month' || a === '--before') {
      const v = argv[i + 1];
      check(typeof v === 'string' && isMonth(v), 'bad-args', `${a} 需要一个 YYYY-MM`);
      out[a === '--month' ? 'month' : 'before'] = v;
      i += 1;
    } else {
      throw new DomainError('bad-args', `不认识的参数：${a}`);
    }
  }
  return out;
}

/**
 * 出折叠计划（纯读，不改文件）。
 * @param {{month?:string|null, before?:string|null, now?:Date}} [opts]
 * @returns {{current:string, base:string|null, months:string[], ignored:string[],
 *   rev:number, total:number, tail:number, root:string}}
 */
export function plan(opts = {}) {
  const month = opts.month ?? null;
  const before = opts.before ?? null;
  const now = opts.now instanceof Date ? opts.now : new Date(opts.now ?? Date.now());
  if (month) check(isMonth(month), 'bad-month', `${month} 不是 YYYY-MM`);
  if (before) check(isMonth(before), 'bad-month', `${before} 不是 YYYY-MM`);

  const current = monthOfAt(now);
  if (month && month >= current) {
    throw new DomainError('incomplete-month', `${month} 还没结束（当前 ${current}），当月不折叠`);
  }

  const read = readAll();
  const onDisk = [...new Set(listFiles().map((f) => monthOfFile(path.basename(f))))]
    .filter(Boolean)
    .sort();

  const candidates = onDisk
    .filter((m) => (read.base ? m > read.base : true))   // 已被最新快照覆盖的月份不用再折
    .filter((m) => m < current);                         // 当月还在写，不折

  const months = candidates
    .filter((m) => (month ? m === month : true))
    .filter((m) => (before ? m < before : true));

  const ignored = onDisk.filter((m) => !months.includes(m));
  return {
    current,
    base: read.base,
    months,
    ignored,
    rev: read.rev,
    total: read.total,
    tail: read.events.length,
    root: rootDir(),
  };
}

/**
 * 执行计划：逐月 写快照 → 回读逐字节校验 → gzip 归档。
 * @param {string[]} months 升序或乱序都行（内部会排序）
 * @param {{allowProjectionGap?:boolean, now?:Date|string}} [opts]
 * @returns {{done:object[], rev:number, base:string|null, snapshots:number, archives:number}}
 */
export function applyPlan(months, opts = {}) {
  if (!opts.allowProjectionGap) {
    throw new DomainError(
      'projection-gap',
      '投影层仍拿 events.length 当 rev（host/service.js:40、storage/projection.js 的 rebuild）。'
      + '接了归档以后重建只会看到尾部，账目会少算；先落 T-0022，或加 --allow-projection-gap 自己承担。',
    );
  }

  const now = opts.now instanceof Date ? opts.now : new Date(opts.now ?? Date.now());
  const createdAt = now.toISOString();
  const read = readAll();
  const expectedRev = read.rev;

  const base = read.bases.length ? read.bases[read.bases.length - 1] : null;
  const state = base ? baseState(base) : emptyState();
  let firstAt = base ? base.firstAt ?? null : null;
  let badLines = base ? Number(base.badLines ?? 0) : 0;
  const archived = new Set(listArchives().map((a) => a.month));

  const done = [];
  for (const month of [...months].sort()) {
    const { events, bad } = readMonth(month);
    if (!events.length && !bad) {
      // 已经归档过的月份在这里会重新出现（原文件已进 archive/），如实标成 archived，别当成"空月"。
      done.push({ month, skipped: archived.has(month) ? 'archived' : 'empty' });
      continue;
    }
    for (const ev of events) {
      applyEvent(state, ev);
      if (!firstAt) firstAt = ev.at;
    }
    badLines += bad;

    const snap = snapshotFromState(month, state, { firstAt, badLines, createdAt });
    const written = writeSnapshot(snap);

    // 回读校验：磁盘上那份折回来必须与写前内存态等价，否则宁可中止也不归档。
    const back = readSnapshot(written.file);
    if (!back) throw new DomainError('snapshot-mismatch', `回读失败：${month}`);
    if (!equalState(baseState(back), state)) {
      throw new DomainError('snapshot-mismatch', `回读与写前不一致，已中止（未归档）：${month}`);
    }

    const arc = archiveMonth(month);
    done.push({
      month,
      events: events.length,
      rev: state.rev,
      snapshot: written.file,
      archive: arc ? arc.archive : null,
      bytes: arc ? arc.bytes : 0,
      gzBytes: arc ? arc.gzBytes : 0,
    });
  }

  const after = readAll();
  if (after.rev !== expectedRev) {
    throw new DomainError('rev-mismatch', `折叠前后 rev 不一致：${expectedRev} → ${after.rev}`);
  }
  return { done, rev: after.rev, base: after.base, snapshots: after.snapshots, archives: after.archives };
}

/**
 * 人类可读的计划输出。
 * @param {object} p plan() 的返回值
 * @returns {string}
 */
function renderPlan(p) {
  const lines = [];
  lines.push(`根目录：${p.root}`);
  lines.push(`当前月：${p.current}（只折叠更早的月份）`);
  lines.push(`有快照：${p.base ?? '无'}　逻辑事件 ${p.rev} 条 / 尾部 ${p.tail} 条`);
  if (!p.months.length) {
    lines.push('计划：无新写入（没有可折叠的完整月份）');
  } else {
    lines.push(`计划折叠：${p.months.join('、')}`);
  }
  const ignored = p.ignored.filter((m) => !p.months.includes(m));
  if (ignored.length) {
    const tag = (m) => {
      if (p.base && m <= p.base) return '已被快照覆盖';
      if (m >= p.current) return '还没结束';
      return '不在本次范围';
    };
    lines.push(`跳过：${ignored.map((m) => `${m}（${tag(m)}）`).join('、')}`);
  }
  return lines.join('\n');
}

/**
 * CLI 入口。
 * @param {string[]} argv
 * @returns {number} 退出码
 */
export function main(argv) {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      console.log(USAGE);
      return 0;
    }
    const p = plan({ month: args.month, before: args.before });
    if (args.json && !args.apply) {
      console.log(JSON.stringify({ mode: 'plan', ...p }, null, 2));
      return 0;
    }
    if (!args.apply) {
      console.log(renderPlan(p));
      console.log('dry-run：未改动任何文件（加 --apply 执行）');
      return 0;
    }

    const report = applyPlan(p.months, { allowProjectionGap: args.allowProjectionGap });
    if (args.json) {
      console.log(JSON.stringify({ mode: 'apply', ...report }, null, 2));
      return 0;
    }
    console.log(renderPlan(p));
    if (!report.done.length) {
      console.log('无新写入：没有月份需要折叠');
      return 0;
    }
    for (const row of report.done) {
      if (row.skipped) {
        console.log(`  ${row.month}：跳过（${row.skipped === 'archived' ? '已归档' : '空'}）`);
        continue;
      }
      console.log(`  ${row.month}：${row.events} 条事件 → rev ${row.rev}；归档 ${row.bytes}B → ${row.gzBytes}B`);
    }
    console.log(`完成：快照 ${report.snapshots} 份，逻辑事件 ${report.rev} 条（折叠前后一致）`);
    return 0;
  } catch (err) {
    if (err instanceof DomainError) {
      console.error(`[拒绝] ${err.message}`);
      return 2;
    }
    console.error(`[错误] ${err?.stack ?? err}`);
    return 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = main(process.argv.slice(2));
