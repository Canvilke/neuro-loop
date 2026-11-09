/**
 * tools/core_verify.mjs —— 用真实事件验证 core 与现有投影一致。
 *
 * 用法：node tools/core_verify.mjs
 * 做三件事：
 *   1) 读 %USERPROFILE%\.dsh\neuro-loop\ 下全部 v1 事件；
 *   2) 用 storage/legacy.js 翻译后用 core 重建；
 *   3) 与磁盘上的 state.json 逐节点比对 hits/misses/streak，并报告耗时。
 *
 * 只读：不写任何文件（重建结果不落盘）。
 */

import process from 'node:process';
import { normalizeEvent } from '../core/events.js';
import { rebuild } from '../core/state.js';
import { fromLegacy, compareBucket } from '../storage/legacy.js';

const store = await import('../host/store.js');

const started = performance.now();
const { events: raw, bad, files } = store.readAllEvents();
const legacyState = store.loadState();

let skipped = 0;
const events = [];
for (const r of raw) {
  const mapped = fromLegacy(r);
  if (!mapped) { skipped += 1; continue; }
  try {
    events.push(normalizeEvent(mapped, { now: mapped.at ?? new Date().toISOString() }));
  } catch (e) {
    skipped += 1;
    if (process.env.NL_VERBOSE) console.error('skip', r, e.code);
  }
}

const modern = rebuild(events);
const elapsed = Math.round(performance.now() - started);

const legacyNodes = legacyState.nodes ?? {};
const ids = new Set([...Object.keys(legacyNodes), ...Object.keys(modern.concepts)]);
const diffs = [];
for (const id of ids) {
  const d = compareBucket(legacyNodes[id] ?? {}, modern.concepts[id]);
  if (d.length) diffs.push({ id, detail: d.join('; ') });
}

console.log(`files=${files} lines=${raw.length} events=${events.length} skipped=${skipped} bad=${bad}`);
console.log(`legacy nodes=${Object.keys(legacyNodes).length} modern concepts=${Object.keys(modern.concepts).length}`);
console.log(`elapsed=${elapsed}ms`);
if (diffs.length === 0) {
  console.log('core ok — 投影与 v1 一致');
} else {
  console.log(`core diff — ${diffs.length} 个节点不一致`);
  for (const d of diffs.slice(0, 10)) console.log(`  ${d.id}: ${d.detail}`);
  process.exitCode = 1;
}
