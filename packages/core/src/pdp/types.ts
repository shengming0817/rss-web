import type { ComputedRef, InjectionKey } from 'vue'

/**
 * 决策效果。对标 BR-004 §3.2 `decision` 三态的前端最小子集：
 * MVP 阶段 `not-applicable`（无适用策略）统一并入 `deny`，接口字段先不暴露，
 * 待 Wave 2 决策日志需要区分"被拒"与"问错了"时再扩。
 */
export type DecisionEffect = 'allow' | 'deny'

/**
 * 结构化授权决策。对标 BR-004 §3.2 `Decision` 的前端消费子集——
 * 只保留前端当前真正消费的字段（effect + reasonCode）；matchedPolicies /
 * decisionId / evaluatedAtMs 等待有消费方时再加（不预设未来需求）。
 */
export interface Decision {
  /** `allow` 明确允许；`deny` 拒绝。 */
  effect: DecisionEffect
  /**
   * 拒绝原因的 i18n key 后缀（如 `role-missing` / `error`）。
   * 消费方拼 `access.pdp.deny.<reasonCode>` 取本地化文案。
   * `allow` 时为空串。
   */
  reasonCode: string
}

/**
 * PDP 客户端契约；实现在 @gocell/access。
 * @gocell/core 只持有 UI 壳 + 注入契约，不含业务逻辑。
 */
export interface PdpClient {
  /**
   * 响应式、fail-closed：仅当决策明确 allow 时为 true。
   * pending / error → false（绝不 fail-open）。供 <Can> / useDecision 消费。
   */
  can(action: string, resource?: string): ComputedRef<boolean>
  /**
   * 异步结构化决策：await 真实决策结果（含拒绝 reasonCode）。
   * 路由守卫专用——避免响应式 `can()` 首次导航 pending→deny 的误拦，
   * 并拿到拒绝原因用于 i18n 提示。结果与 `can()` 共享同一缓存。
   */
  decide(action: string, resource?: string): Promise<Decision>
}

/**
 * Vue injection key for PdpClient.
 * 由 @gocell/access 在应用装配层 provide；
 * @gocell/core 的 useDecision / Can 通过此 key inject。
 */
export const PDP_INJECTION_KEY: InjectionKey<PdpClient> = Symbol('gocell.pdp')
