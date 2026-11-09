/**
 * core/metrics.js —— 派生量与调度。
 *
 * 职责：把累计计数变成"命中率、准确率、假阳性、到期、缓存状态"。
 * 不负责：维护计数（在 state.js）、读写时间（时间一律传入）。
 * 依赖：无
 *
 * 三条不变量（与 RESEARCH-PLAN §4.2 一致）：
 *   1) 命中与准确是两个数，任何聚合都不得把它们合成一个"掌握度"；
 *   2) 假阳性是查询结果，不是字段；
 *   3) 时间必须可解释：没有 duration 的"会"等于没有测。
 */

const DAY = 86_400_000;

/** 稳定阈值：至少三次尝试、命中率高、且没有假阳性。 */
const STABLE_MIN_ATTEMPTS = 3;
const STABLE_HIT = 0.8;
/** 脆弱阈值：命中率低于此值，或出现假阳性。 */
const FRAGILE_HIT = 0.5;
/** 间隔上限（天）。45 天约等于一个学期内的最大可承受间隔。 */
const INTERVAL_CAP = 45;

/**
 * 某条尝试是否算"这次会了"。
 * 只有"没答错"且"没有实做失败"才算；命中但做错＝假阳性，不算会。
 * @param {{recall:'hit'|'miss'|'recon', solve:'ok'|'fail'|null}} a
 */
export function isOk(a) {
  return a.recall !== 'miss' && a.solve !== 'fail';
}

/**
 * 间隔天数（FSRS 的精神，简化为可手算）。
 * 失败 → 1 天；成功 → min(45, 2^(streak-1))，streak 从 1 起。
 * @param {number} streak 连续成功次数（本次计入）
 * @param {boolean} ok
 * @returns {number}
 */
export function intervalDays(streak, ok) {
  if (!ok) return 1;
  const s = Math.max(1, streak);
  return Math.min(INTERVAL_CAP, 2 ** (s - 1));
}

/**
 * 到期时间。
 * @param {string} lastAt ISO
 * @param {number} days
 * @returns {string} ISO
 */
export function dueAt(lastAt, days) {
  const t = new Date(lastAt).getTime();
  return new Date(t + days * DAY).toISOString();
}

/**
 * 命中率：recall 为 hit 的比例（recon 不算命中，也不算未命中）。
 * @param {{hits:number, misses:number}} c
 * @returns {number} 0..1；没有样本时为 0
 */
export function hitRate(c) {
  const n = c.hits + c.misses;
  return n === 0 ? 0 : c.hits / n;
}

/**
 * 准确率：solve 为 ok 的比例。没有 solve 记录时返回 null（而不是 0）。
 * 这个区别很重要：null 表示"没测"，0 表示"测了且全错"。
 * @param {{solveOk:number, solveFail:number}} c
 * @returns {number|null}
 */
export function accuracy(c) {
  const n = c.solveOk + c.solveFail;
  return n === 0 ? null : c.solveOk / n;
}

/**
 * 假阳性：命中过，且实做失败过。
 * @param {{hits:number, fp:number}} c
 * @returns {boolean}
 */
export function isFalsePositive(c) {
  return c.hits > 0 && c.fp > 0;
}

/**
 * 分类：stable / fragile / unknown。
 * @param {{attempts:number, hits:number, misses:number, fp:number, solveOk:number, solveFail:number}} c
 * @returns {'stable'|'fragile'|'unknown'}
 */
export function classify(c) {
  if (c.attempts === 0) return 'unknown';
  const hr = hitRate(c);
  if (isFalsePositive(c)) return 'fragile';
  if (hr < FRAGILE_HIT) return 'fragile';
  if (c.attempts >= STABLE_MIN_ATTEMPTS && hr >= STABLE_HIT) return 'stable';
  return 'unknown';
}

/**
 * 缓存状态（KV cache 的字面实现）。
 *   fresh —— 未到期，遇到同考点可直接"读现成状态"；
 *   stale —— 已过期，下次必须重推（不是重读）；
 *   none  —— 从没测过。
 * @param {{attempts:number, dueAt:string|null}} c
 * @param {number} nowMs
 * @returns {'fresh'|'stale'|'none'}
 */
export function cacheState(c, nowMs) {
  if (!c.attempts || !c.dueAt) return 'none';
  return new Date(c.dueAt).getTime() > nowMs ? 'fresh' : 'stale';
}

/**
 * 给 UI 用的中文短语（单一来源，避免各面板各写一套）。
 * @param {string|null} dueIso
 * @param {number} nowMs
 * @returns {string}
 */
export function dueText(dueIso, nowMs) {
  if (!dueIso) return '未排期';
  const d = new Date(dueIso).getTime() - nowMs;
  if (d <= 0) {
    const overdue = Math.floor(-d / DAY);
    return overdue >= 1 ? `逾期 ${overdue} 天` : '今天之内';
  }
  const days = Math.ceil(d / DAY);
  return days <= 1 ? '明天' : `在 ${days} 天后`;
}

/** 一天毫秒数，导出给调用方做日期运算，避免各处重复写。 */
export const ONE_DAY_MS = DAY;
