// Neuro-Loop 宿主半边（S1/S2）——只做装配：注入、路由表、清理。
//
// 打包插件的客户端半边没有 host.call，所以前后端之间只有一条路：HTTP。
// 端点实现按文件放在 host/handlers/（state / event / today / team / bus / room / mail），
// 共用的守卫与响应壳在 host/reply.js；这里不再写任何处理逻辑。
import { onState, resetCache } from './host/handlers/state.js'
import { onEvent, onEvents } from './host/handlers/event.js'
import { onMail } from './host/handlers/mail.js'
import { onToday } from './host/handlers/today.js'
import { onTeam } from './host/handlers/team.js'
import { onBus } from './host/handlers/bus.js'
import { onRoom } from './host/handlers/room.js'

export { resetCache }

// 依赖 webServer：这个 profile 一定有它（页面就是它发的）。
// 不用 { optional: [...] } 的写法——当前 loader 会把键名当成服务名去等，
// 结果卡在 "waiting for service: optional"。
export const inject = ['webServer']

export const ROUTE_STATE = '/neuroloop/state'
export const ROUTE_EVENT = '/neuroloop/event'
export const ROUTE_EVENTS = '/neuroloop/events'
export const ROUTE_MAIL = '/neuroloop/mail'
export const ROUTE_TODAY = '/neuroloop/today'
export const ROUTE_TEAM = '/neuroloop/team'
export const ROUTE_BUS = '/neuroloop/bus'
export const ROUTE_ROOM = '/neuroloop/room'

// 路由表：顺序即注册顺序（test/host.mjs 对它做快照断言）。
const routes = [
  { kind: 'exact', path: ROUTE_STATE, handler: onState },
  { kind: 'exact', path: ROUTE_EVENT, handler: onEvent },
  { kind: 'exact', path: ROUTE_EVENTS, handler: onEvents },
  { kind: 'exact', path: ROUTE_MAIL, handler: onMail },
  { kind: 'exact', path: ROUTE_TODAY, handler: onToday },
  { kind: 'exact', path: ROUTE_TEAM, handler: onTeam },
  { kind: 'exact', path: ROUTE_BUS, handler: onBus },
  { kind: 'exact', path: ROUTE_ROOM, handler: onRoom },
]

export function apply(ctx) {
  const ws = (ctx.get && ctx.get('webServer')) || ctx.webServer
  if (!ws || typeof ws.register !== 'function') {
    if (ctx.logger && ctx.logger.warn) ctx.logger.warn('[neuro-loop] webServer 不可用，后端未启用')
    return
  }
  ctx.effect(() => {
    const disposers = []
    try {
      for (const route of routes) disposers.push(ws.register(route))
    } catch (err) {
      for (const d of disposers) {
        try {
          d()
        } catch {
          /* noop */
        }
      }
      throw err
    }
    return () => {
      for (const d of disposers) {
        try {
          d()
        } catch {
          /* noop */
        }
      }
    }
  })
}
