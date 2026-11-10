#!/usr/bin/env node
/**
 * bus.mjs — 三条通道共用的一条append-only总线。
 *
 * 铁律：总线只追加，不改写。过期的东西靠 `--since` 与读取端自己过滤，
 * 不靠删行。这样任何一方（Lead、子代理、微信桥）断线重连都不会丢消息。
 *
 * lane 语义（不是分类展示，是投递语义）：
 *   sub   Lead ↔ 子代理 / 队友
 *   repo  票单与提交（ticket.mjs 会写一条）
 *   wx    微信进 / 出（进：gateway.log 抓取；出：待投递队列）
 *   note  人读的旁注，不投递
 *
 * 用法：
 *   node tools/bus.mjs post --lane sub --from ui-agent --to lead --text "T-0003 做完了"
 *   node tools/bus.mjs tail [--lane wx] [--since 12] [--limit 20]
 *   node tools/bus.mjs pending            # 各 lane 未读数（按 to=lead 与 wx-out）
 *   node tools/bus.mjs out --from lead --to wx --text "..."   # 放进微信待发送队列
 *   node tools/bus.mjs ack --ids a1b2 c3d4                    # 标记已读（只写 ack 行，不改原行）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LANES = ['sub', 'repo', 'wx', 'note'];
export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function busPath(root = ROOT) {
  return path.join(root, 'bus', 'bus.jsonl');
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

let counter = 0;
export function mintId(now = Date.now(), salt = '') {
  counter = (counter + 1) % 4096;
  const body = `${now}:${counter}:${salt}:${Math.random().toString(36).slice(2, 8)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i += 1) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + now.toString(36).slice(-4);
}

export function post(input, root = ROOT) {
  const lane = String(input.lane ?? '').trim();
  if (!LANES.includes(lane)) throw new Error(`bad-lane: ${lane || '(空)'}`);
  const text = String(input.text ?? '').trim();
  if (!text) throw new Error('empty-text');
  if (text.length > 4000) throw new Error('text-too-long');
  const rec = {
    id: mintId(Date.now(), lane),
    at: new Date().toISOString(),
    lane,
    from: String(input.from ?? 'lead').trim() || 'lead',
    to: String(input.to ?? 'lead').trim() || 'lead',
    text,
    ...(input.ref ? { ref: String(input.ref) } : {}),
  };
  const file = busPath(root);
  ensureDir(file);
  // 半行写入（进程被杀）会让下一行粘在上面；追加前先补一个换行，保证行边界。
  try {
    const st = fs.statSync(file);
    if (st.size > 0) {
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(1);
      fs.readSync(fd, buf, 0, 1, st.size - 1);
      fs.closeSync(fd);
      if (buf[0] !== 10) fs.appendFileSync(file, '\n', 'utf8');
    }
  } catch {
    /* 文件不存在：第一次写 */
  }
  fs.appendFileSync(file, JSON.stringify(rec) + '\n', 'utf8');
  return rec;
}

/** 读全部行；坏行只计数，不抛（半行写入是现实，不是异常）。 */
export function read(root = ROOT) {
  const file = busPath(root);
  if (!fs.existsSync(file)) return { rows: [], bad: 0, lines: 0 };
  const raw = fs.readFileSync(file, 'utf8').split('\n');
  const rows = [];
  let bad = 0;
  let lines = 0;
  for (const line of raw) {
    if (!line.trim()) continue;
    lines += 1;
    try {
      const obj = JSON.parse(line);
      if (obj && obj.id && (obj.lane || Array.isArray(obj.ack))) rows.push(obj);
      else bad += 1;
    } catch {
      bad += 1;
    }
  }
  return { rows, bad, lines };
}

/** ack 也是追加行：{ id, lane:'note', ack:[...] } 太别扭，单列一条 ack 数组行。 */
export function ack(ids, { by = 'lead' } = {}, root = ROOT) {
  const list = (Array.isArray(ids) ? ids : [ids]).map((x) => String(x)).filter(Boolean);
  if (list.length === 0) throw new Error('no-ids');
  const file = busPath(root);
  ensureDir(file);
  const rec = { id: mintId(Date.now(), 'ack'), at: new Date().toISOString(), ack: list, by };
  fs.appendFileSync(file, JSON.stringify(rec) + '\n', 'utf8');
  return rec;
}

export function view(root = ROOT) {
  const { rows, bad, lines } = read(root);
  const acked = new Set();
  for (const r of rows) if (Array.isArray(r.ack)) for (const id of r.ack) acked.add(id);
  const msgs = rows.filter((r) => r.lane);
  return { msgs, acked, bad, lines };
}

export function pending(root = ROOT, to = 'lead') {
  const { msgs, acked } = view(root);
  const out = { sub: 0, repo: 0, wx: 0, note: 0 };
  for (const m of msgs) {
    if (acked.has(m.id)) continue;
    if (m.to !== to) continue;
    if (m.lane in out) out[m.lane] += 1;
  }
  return out;
}

function fmt(m) {
  const tail = m.ref ? ` (${m.ref})` : '';
  return `${m.at.slice(11, 19)}  [${m.lane}] ${m.from}→${m.to}  ${m.text}${tail}  #${m.id}`;
}

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = { _: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next && !next.startsWith('--')) {
        opts[key] = next;
        i += 1;
      } else {
        opts[key] = true;
      }
    } else {
      opts._.push(a);
    }
  }
  return { cmd, opts };
}

export function run(argv, root = ROOT) {
  const { cmd, opts } = parseArgs(argv);
  try {
    if (cmd === 'post' || cmd === 'out') {
      const rec = post(
        {
          lane: cmd === 'out' ? 'wx' : opts.lane || 'note',
          from: opts.from || 'lead',
          to: cmd === 'out' ? 'wx' : opts.to || 'lead',
          text: opts.text,
          ref: opts.ref,
        },
        root,
      );
      process.stdout.write(`posted #${rec.id} [${rec.lane}] ${rec.from}→${rec.to}\n`);
      if (cmd === 'out') {
        process.stdout.write('出队消息已进总线 lane=wx；微信侧由 IM 会话在下一回合取走（没有推送接口，见 docs/BUS.md）。\n');
      }
      return 0;
    }
    if (cmd === 'tail') {
      const { msgs, acked } = view(root);
      const lane = opts.lane;
      let list = msgs.filter((m) => !lane || m.lane === lane);
      const since = Number(opts.since);
      if (Number.isFinite(since) && since > 0) list = list.slice(-since);
      const limit = Number(opts.limit);
      if (Number.isFinite(limit) && limit > 0) list = list.slice(-limit);
      if (list.length === 0) {
        process.stdout.write('(空)\n');
        return 0;
      }
      for (const m of list) {
        const mark = acked.has(m.id) ? ' ' : '*';
        process.stdout.write(`${mark} ${fmt(m)}\n`);
      }
      return 0;
    }
    if (cmd === 'pending') {
      const p = pending(root, opts.to || 'lead');
      process.stdout.write(
        `sub ${p.sub} · repo ${p.repo} · wx ${p.wx} · note ${p.note}\n`,
      );
      return 0;
    }
    if (cmd === 'ack') {
      const rec = ack(opts._.length ? opts._ : [opts.id], { by: opts.by || 'lead' }, root);
      process.stdout.write(`acked ${rec.ack.length}\n`);
      return 0;
    }
    process.stdout.write(
      'usage: bus.mjs post|out|tail|pending|ack [--lane sub|repo|wx|note] [--from] [--to] [--text] [--ref] [--since n] [--limit n]\n',
    );
    return 2;
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 3;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(run(process.argv.slice(2)));
}
