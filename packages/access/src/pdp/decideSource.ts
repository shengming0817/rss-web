import type { Decision } from '@gocell/core'

/**
 * PDP 决策入参。UI 用 (action, resource) 的细粒度词表表达授权需求；决策源
 * （生产 = httpDecide）负责把它翻译成后端注册的权限名再发 `/decide`。
 */
export interface DecisionRequest {
  action: string
  // 显式允许 undefined：can()/decide() 的 resource 可省略，透传到此处（exactOptionalPropertyTypes）。
  resource?: string | undefined
}

/**
 * 决策函数签名——createPdpClient 的唯一决策源注入缝。
 * 生产由 `createHttpDecide()` 提供（接真实后端 `POST /api/v1/access/decide`）；
 * 测试注入 fake；未注入时 createPdpClient 用 fail-closed deny-all 兜底。
 */
export type DecideFn = (req: DecisionRequest) => Promise<Decision>
