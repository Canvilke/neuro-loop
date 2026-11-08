// 事件白名单。只有四种，多一种都不收（收多了以后就要写迁移）。
// 校验在入口做一次，之后整条链路都相信这个形状。

const NODE_RE = /^[a-z][a-z0-9._-]{0,63}$/
const SHARD_RE = /^(?:shard|sh):[a-z0-9._:-]{1,80}$/
const TAGS = ['fp', 'miss', 'ok']
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const TEXT_MAX = 400

export function normalizeEvent(raw, now) {
  if (!raw || typeof raw !== 'object') return { ok: false, code: 'bad-shape' }
  const kind = raw.kind || raw.k
  if (kind === 'recall' || kind === 'review') {
    if (!NODE_RE.test(String(raw.node || raw.n || ''))) return { ok: false, code: 'bad-node' }
    const v = raw.ok
    if (v !== 0 && v !== 1 && v !== true && v !== false) return { ok: false, code: 'bad-ok' }
    return {
      ok: true,
      event: { t: stamp(raw.at, now), k: 'recall', n: String(raw.node || raw.n), ok: v ? 1 : 0 },
    }
  }
  if (kind === 'note') {
    if (!NODE_RE.test(String(raw.node || raw.n || ''))) return { ok: false, code: 'bad-node' }
    const tag = raw.tag == null ? 'fp' : String(raw.tag)
    if (!TAGS.includes(tag)) return { ok: false, code: 'bad-tag' }
    let text = raw.text == null ? '' : String(raw.text)
    if (text.length > TEXT_MAX) return { ok: false, code: 'text-too-long' }
    return {
      ok: true,
      event: { t: stamp(raw.at, now), k: 'note', n: String(raw.node || raw.n), tag, text },
    }
  }
  if (kind === 'daily') {
    // 每日一页回填：一天一科一条，只记事实（用时/错号/卡点），不记对错统计。
    const d = String(raw.date || raw.d || '')
    if (!DAY_RE.test(d)) return { ok: false, code: 'bad-date' }
    const s = String(raw.subject || raw.s || '')
    if (!/^[a-z]{3,12}$/.test(s)) return { ok: false, code: 'bad-subject' }
    const min = raw.minutes == null ? null : Number(raw.minutes)
    if (min !== null && (!Number.isFinite(min) || min < 0 || min > 600)) {
      return { ok: false, code: 'bad-minutes' }
    }
    let wrong = raw.wrong == null ? [] : raw.wrong
    if (!Array.isArray(wrong) || wrong.length > 50) return { ok: false, code: 'bad-wrong' }
    wrong = wrong.map((x) => Number(x))
    if (wrong.some((x) => !Number.isInteger(x) || x < 1 || x > 99)) return { ok: false, code: 'bad-wrong' }
    const clip = (v, n) => (v == null ? '' : String(v).slice(0, n))
    return {
      ok: true,
      event: {
        t: stamp(raw.at, now),
        k: 'daily',
        d,
        s,
        min: min === null ? null : Math.round(min),
        w: wrong,
        blk: clip(raw.blocked, 200),
        note: clip(raw.note, 200),
      },
    }
  }
  if (kind === 'flatten' || kind === 'unflatten') {
    const s = String(raw.shard || raw.s || '')
    if (!SHARD_RE.test(s)) return { ok: false, code: 'bad-shard' }
    return { ok: true, event: { t: stamp(raw.at, now), k: kind, s } }
  }
  return { ok: false, code: 'bad-kind' }
}

function stamp(at, now) {
  if (typeof at === 'string') {
    const ms = Date.parse(at)
    if (Number.isFinite(ms)) return new Date(ms).toISOString()
  }
  return new Date(now || Date.now()).toISOString()
}
