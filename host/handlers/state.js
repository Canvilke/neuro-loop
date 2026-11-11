// GET /neuroloop/state：读整份投影（客户端启动时合并）。
// 不负责：事件写入（host/handlers/event.js）、投影重建细节（host/service.js）。
import { getState, reset as resetService } from '../service.js'
import { deny, denyMethod, envelope, fail, writeJson } from '../reply.js'

/** 测试用：丢掉内存里的库句柄，下次读会从 L1 重建投影。 */
export function resetCache() {
  resetService()
}

export function onState(req, res) {
  if (denyMethod(req, res, 'GET')) return
  if (deny(req, res)) return
  try {
    const s = getState()
    writeJson(res, 200, envelope({ state: s }, s.rev))
  } catch (err) {
    fail(res, 500, 'state-failed', String(err && err.message))
  }
}
