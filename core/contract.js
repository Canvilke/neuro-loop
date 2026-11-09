/**
 * core/contract.js —— 契约常量与错误类型。
 *
 * 职责：定义事件白名单、id 形态、数值上限、错误码。
 * 不负责：读取事件、计算投影、读写文件。
 * 依赖：无（本文件必须保持零依赖，客户端与宿主都能 import）。
 */

/** 事件格式版本；读旧事件时按此分派迁移。 */
export const EVENT_VERSION = 2;

/** 投影格式版本；与事件版本独立（投影可随时丢弃重建）。 */
export const SCHEMA_VERSION = 2;

/** 六科短 id，与 data/seed.json 的 subject.id 一致。 */
export const SUBJECTS = Object.freeze([
  'chinese', 'math', 'english', 'physics', 'chemistry', 'politics',
]);

/** 事件类型白名单。新增类型必须同时改 events/state/测试。 */
export const EVENT_KINDS = Object.freeze([
  'attempt', 'problem.new', 'problem.edit', 'method.new', 'method.edit',
  'daily', 'flatten', 'unflatten', 'note',
]);

/** 上限。数字来自真实使用：单次录入不该超过 30 秒，单条备注不该超过半屏。 */
export const LIMITS = Object.freeze({
  text: 400,
  note: 400,
  claim: 40,
  wrongMax: 50,
  batchMax: 200,
  durationMs: 3_600_000,
  minutes: 600,
  concepts: 4,
  methods: 3,
  difficultyMin: 1,
  difficultyMax: 5,
});

/** 考点 id：`math-deriv`、`physics-momentum`；小写字母开头，允许 - . _ */
export const RE_CONCEPT = /^[a-z][a-z0-9._-]{1,63}$/;
/** 方法 id：`m.centroid-fixed` */
export const RE_METHOD = /^m\.[a-z0-9][a-z0-9._-]{0,63}$/;
/** 题 id：`p.2026-11-10.001` */
export const RE_PROBLEM = /^p\.[a-z0-9][a-z0-9._-]{1,63}$/;
/** 碎片键：`sh:politics:1a2b3c` */
export const RE_SHARD = /^sh:[a-z]{1,12}:[a-z0-9]{1,32}$/;
/** 日期：YYYY-MM-DD */
export const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 领域错误。所有校验失败都抛它，带机器可读的 code。
 * 路由层把 code 原样回给客户端，不做二次翻译。
 */
export class DomainError extends Error {
  /**
   * @param {string} code 形如 `bad-concept`、`too-many-concepts`
   * @param {string} [detail] 给人看的补充，不回传给客户端
   */
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'DomainError';
    this.code = code;
  }
}

/**
 * 断言；失败抛 DomainError。
 * @param {unknown} cond
 * @param {string} code
 * @param {string} [detail]
 */
export function check(cond, code, detail) {
  if (!cond) throw new DomainError(code, detail);
}

/**
 * 是否为合法日期串（不只形状，还要真实存在）。
 * @param {string} s
 * @returns {boolean}
 */
export function isDate(s) {
  if (typeof s !== 'string' || !RE_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * 截断到上限，用于"宁可存下也不要报错"的字段（备注类）。
 * @param {string} s
 * @param {number} max
 * @returns {string}
 */
export function clip(s, max) {
  const t = String(s ?? '').trim();
  return t.length <= max ? t : t.slice(0, max);
}
