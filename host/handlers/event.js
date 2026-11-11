// POST /neuroloop/event（单条）与 /neuroloop/events（批量导入）。
// 两条路由共用同一条链路（host/event.js 校验 → host/service.js 落盘），
// 所以"什么算合法事件"永远只有一个答案，不另写一份 append/投影逻辑。
// 不负责：请求体读取（host/http.js）、响应外壳（host/reply.js）。
import { addEvent, getState } from '../service.js'
import { readJsonBody } from '../http.js'
import { normalizeEvent } from '../event.js'
import { LIMITS } from '../../core/contract.js'
import { deny, denyMethod, envelope, fail, writeJson } from '../reply.js'

// 批量导入的上限与 core 的 LIMITS 同一个数：超了整批拒，一条都不写。
const BATCH_MAX = LIMITS.batchMax

export async function onEvent(req, res) {
  if (denyMethod(req, res, 'POST')) return
  if (deny(req, res)) return

  const body = await readJsonBody(req)
  if (!body.ok) return fail(res, 400, body.code)

  const norm = normalizeEvent(body.value)
  if (!norm.ok) return fail(res, 400, norm.code)

  try {
    // 顺序要紧：先落 L1（真源），再改投影，再原子覆盖 state.json。
    const { state: s, event: stored } = addEvent(norm.event)
    writeJson(res, 200, envelope({ event: stored, state: s }, s.rev))
  } catch (err) {
    fail(res, 500, 'write-failed', String(err && err.message))
  }
}

/**
 * 批量导入：POST /neuroloop/events
 *
 * 逐条校验、部分成功：一条非法只进 rejected，不连累整批；
 * 只有"请求体形状不对"和"超上限"才是整批 400。
 */
export async function onEvents(req, res) {
  if (denyMethod(req, res, 'POST')) return
  if (deny(req, res)) return

  const body = await readJsonBody(req, { allowArray: true })
  if (!body.ok) return fail(res, 400, body.code)

  // 两种入参都收：{ events: [...] } 与裸数组。
  const list = Array.isArray(body.value) ? body.value : body.value.events
  if (!Array.isArray(list)) return fail(res, 400, 'bad-shape')
  // 超上限先挡在磁盘外：一条都不写。
  if (list.length > BATCH_MAX) return fail(res, 400, 'batch-too-large')

  const rejected = []
  const ids = []
  let rev = null
  for (let i = 0; i < list.length; i += 1) {
    const norm = normalizeEvent(list[i])
    if (!norm.ok) {
      rejected.push({ index: i, error: norm.code })
      continue
    }
    try {
      // 唯一写路径：与单条路由完全一样的 addEvent。
      const { state: s, event: stored } = addEvent(norm.event)
      ids.push(stored.id)
      rev = s.rev
    } catch (err) {
      // core 的 DomainError 原样带 code（bad-concept / bad-text ...），不新造含糊字符串。
      if (err && typeof err.code === 'string') {
        rejected.push({ index: i, error: err.code })
        continue
      }
      return fail(res, 500, 'write-failed', String(err && err.message))
    }
  }

  // 全被拒时也要回报 rev（没写过就取当前投影的）；批量响应不带 data 外壳。
  writeJson(res, 200, { ok: true, accepted: ids.length, rejected, ids, rev: rev === null ? getState().rev : rev })
}
