/**
 * 生产 PDP 决策源——接后端 `POST /api/v1/access/decide`（http.auth.decide.v1，BR-004 §4.1）。
 *
 * 注入 `createPdpClient({ decide: createHttpDecide() })` 替代占位决策源；缓存 / TTL /
 * 单飞 / fail-closed 链路不变。把 UI (action, resource) 经 `toPermission` 翻译成后端注册
 * 权限名后发请求，响应 `{ data: { allowed } }` 映射回前端 `Decision`。
 *
 * - 决策主体来自 JWT（请求体不带 subject）；coarse 页面 / 能力检查**不传**后端 `resource`
 *   （实例 id），仅 ownership-scoped 检查才透传（见 contract schema note）——前端 resource
 *   参数是资源「类型」，只用于拼权限名，不是实例 id。
 * - HTTP 失败（4xx/5xx，含未注册 action 的 400、PDP fail-closed 的 403/503）→ 抛出，由
 *   `createPdpClient.fetchDecision` 的 catch 统一 fail-closed 成 `deny('error')`。
 */
import { http } from '@gocell/request'
import type { HttpAuthDecideV1Request, HttpAuthDecideV1Response } from '@gocell/contracts'
import type { DecideFn } from './decideSource'
import { toPermission } from './permissionMap'

/** PDP 决策端点（contract http.auth.decide.v1，ownerCell accesscore）。 */
export const DECIDE_URL = '/api/v1/access/decide'

/**
 * 创建接真实后端 PDP 的决策函数。
 * 装配层注入：`createPdpClient({ decide: createHttpDecide() })`。
 */
export function createHttpDecide(): DecideFn {
  return async ({ action, resource }) => {
    const body: HttpAuthDecideV1Request = { action: toPermission(action, resource) }
    const res = await http.post<HttpAuthDecideV1Response>(DECIDE_URL, body)
    return res.data.data.allowed
      ? { effect: 'allow', reasonCode: '' }
      : { effect: 'deny', reasonCode: 'role-missing' }
  }
}
