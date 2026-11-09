/**
 * storage/legacy.js —— v1 事件（短字段）到 v2 事件的只读适配。
 *
 * 职责：把 `{k,t,n,ok,d,s,min,w,blk,note}` 这种紧凑行翻译成 core 认识的形态。
 * 不负责：写盘、迁移落盘（迁移脚本是 M11-3，本文件只读）。
 * 依赖：无
 *
 * 为什么保留短字段：v1 的行已经写在磁盘上，且体积小、人眼可读；
 * 重写历史没有收益，适配一次即可。
 */

/**
 * v1 行 → v2 原始事件（交给 core/events.normalizeEvent 规范化）。
 * 未知类型返回 null，由调用方计数。
 * @param {any} ev
 * @returns {object|null}
 */
export function fromLegacy(ev) {
  if (!ev || typeof ev !== 'object' || typeof ev.k !== 'string') return null;
  const at = typeof ev.t === 'string' ? ev.t : null;

  switch (ev.k) {
    case 'recall':
    case 'review':
      return {
        kind: 'attempt',
        at,
        concept: ev.n ?? ev.node,
        recall: ev.ok === false ? 'miss' : 'hit',
        solve: null,
        durationMs: 0,
      };

    case 'note':
      return { kind: 'note', at, text: String(ev.note ?? ev.text ?? ev.n ?? ''), ref: ev.n ?? null };

    case 'daily':
      return {
        kind: 'daily',
        at,
        date: ev.d,
        subject: ev.s,
        minutes: ev.min ?? 0,
        wrong: Array.isArray(ev.w) ? ev.w : [],
        blocked: ev.blk === true,
        note: ev.note ?? '',
      };

    case 'flatten':
      return { kind: 'flatten', at, shard: ev.s };

    case 'unflatten':
      return { kind: 'unflatten', at, shard: ev.s };

    case 'problem':
    case 'problem.new':
      return {
        kind: 'problem.new',
        at,
        id: ev.id,
        subject: ev.s,
        concepts: ev.c ?? ev.concepts ?? [],
        methods: ev.m ?? ev.methods ?? [],
        difficulty: ev.diff ?? 3,
        text: ev.text ?? '',
      };

    default:
      return null;
  }
}

/**
 * 把 v1 投影里的一个 node 桶与 core 的 concepts 桶对照，返回差异清单。
 * 只比对两边都有的字段（v1 没有 fp/recon/solve，不参与）。
 * @param {{hits:number,misses:number,streak:number}} legacy
 * @param {{hits:number,misses:number,streak:number}} modern
 * @returns {string[]} 空数组表示一致
 */
export function compareBucket(legacy, modern) {
  const out = [];
  if (!modern) return ['missing in modern'];
  for (const k of ['hits', 'misses', 'streak']) {
    if (Number(legacy[k] ?? 0) !== Number(modern[k] ?? 0)) {
      out.push(`${k}: legacy=${legacy[k]} modern=${modern[k]}`);
    }
  }
  return out;
}
