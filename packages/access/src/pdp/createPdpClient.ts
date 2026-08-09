/**
 * PDP client（issue #50 / BR-004 §4.1）。
 *
 * 决策源由装配层注入：生产用 `createHttpDecide()`（接后端 `POST /api/v1/access/decide`，
 * gocell#1863 已上线），测试注入 fake。client 持有跨决策源不变的能力——响应式缓存 +
 * TTL 失效 + 单飞 + 异步结构化决策 + fail-closed。未注入 `decide` 时用 deny-all 兜底
 * （fail-closed，杜绝忘记装配导致的 fail-open）。
 *
 * 两条消费路径，共享同一缓存：
 * - `can()`：响应式 ComputedRef<boolean>，供 <Can> / useDecision；pending/error → false。
 * - `decide()`：异步结构化 Decision（含拒绝 reasonCode），供路由守卫——await 真实结果，
 *   避免响应式 can() 首次导航 pending→deny 的误拦，并拿到拒绝原因用于 i18n 提示。
 */
import { computed, reactive } from 'vue'
import type { ComputedRef } from 'vue'
import type { Decision, PdpClient } from '@gocell/core'
import type { DecideFn } from './decideSource'

const TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Fail-closed 默认决策源：未注入 `decide` 时一律 deny，杜绝忘记装配（生产应注入
 * `createHttpDecide()`）导致的 fail-open。reasonCode 'error' → 通用「权限校验失败」提示。
 */
const denyAllDecide: DecideFn = () => Promise.resolve({ effect: 'deny', reasonCode: 'error' })

interface CacheEntry {
  decision: Decision
  fetchedAt: number
}

interface Cache {
  entries: Record<string, CacheEntry>
  expiryTick: number
}

function cacheKey(action: string, resource: string | undefined): string {
  return `${action}|${resource ?? ''}`
}

export interface PdpClientOptions {
  /**
   * 决策源。生产由装配层注入 `createHttpDecide()`（接后端 `/api/v1/access/decide`）。
   * 省略时 fail-closed deny-all 兜底（不 fail-open）。测试可注入 fake（BR-004 §4.1）。
   */
  decide?: DecideFn
}

/**
 * 创建 PdpClient 实现。
 *
 * 设计：
 * - 响应式缓存（reactive record），key = `action|resource`。
 * - 缺失 / 过期 → 触发一次异步 `decide`；结果写回缓存 → 共享该 key 的 ComputedRef 响应式更新。
 * - fail-closed：pending / 决策源异常 → false / deny；仅明确 `allow` 才放行。
 * - TTL = 5 分钟；过期项下次访问重新取数（由 decideFn 覆写缓存项，不在 computed 内做副作用删除）。
 * - 单飞：每个 key 同一时刻仅一个在途请求，并发 can()/decide() 复用同一 Promise。
 * - ComputedRef 缓存：同 key 始终返回同一 ComputedRef 实例，避免重复 can() 调用堆积。
 */
export function createPdpClient(options: PdpClientOptions = {}): PdpClient {
  const decideFn: DecideFn = options.decide ?? denyAllDecide
  const store = reactive<Cache>({ entries: {}, expiryTick: 0 })
  const inFlight = new Map<string, Promise<Decision>>()
  const computedCache = new Map<string, ComputedRef<boolean>>()
  const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.fetchedAt > TTL_MS
  }

  /** 取新鲜（存在且未过期）缓存项；否则 undefined。纯读，无副作用。 */
  function freshDecision(action: string, resource: string | undefined): Decision | undefined {
    const entry = store.entries[cacheKey(action, resource)]
    if (!entry || isExpired(entry)) return undefined
    return entry.decision
  }

  function scheduleExpiryTick(key: string, fetchedAt: number): void {
    const existing = expiryTimers.get(key)
    if (existing !== undefined) clearTimeout(existing)

    const delay = Math.max(0, TTL_MS - (Date.now() - fetchedAt) + 1)
    const timer = setTimeout(() => {
      expiryTimers.delete(key)
      store.expiryTick += 1
    }, delay)
    expiryTimers.set(key, timer)
  }

  /** 触发（或复用在途的）一次决策取数，结果写回缓存。fail-closed on error。 */
  function fetchDecision(action: string, resource: string | undefined): Promise<Decision> {
    const key = cacheKey(action, resource)
    const existing = inFlight.get(key)
    if (existing) return existing

    const promise = (async (): Promise<Decision> => {
      try {
        const decision = await decideFn({ action, resource })
        const fetchedAt = Date.now()
        store.entries[key] = { decision, fetchedAt }
        scheduleExpiryTick(key, fetchedAt)
        return decision
      } catch {
        // 决策源异常 → fail-closed：缓存 deny 防止刷请求，TTL 到期后重试。
        const denied: Decision = { effect: 'deny', reasonCode: 'error' }
        const fetchedAt = Date.now()
        store.entries[key] = { decision: denied, fetchedAt }
        scheduleExpiryTick(key, fetchedAt)
        return denied
      } finally {
        inFlight.delete(key)
      }
    })()

    inFlight.set(key, promise)
    return promise
  }

  function can(action: string, resource?: string): ComputedRef<boolean> {
    const key = cacheKey(action, resource)
    const cached = computedCache.get(key)
    if (cached) return cached

    const ref = computed(() => {
      void store.expiryTick
      const fresh = freshDecision(action, resource)
      if (!fresh) {
        // 缺失 / 过期 → 触发异步取数（computed 必须同步，不 await）；fail-closed 返回 false。
        // fetchDecision 解析后覆写 store.entries[key]，响应式触发本 computed 重算。
        void fetchDecision(action, resource)
        return false
      }
      return fresh.effect === 'allow'
    })

    computedCache.set(key, ref)
    return ref
  }

  async function decide(action: string, resource?: string): Promise<Decision> {
    const fresh = freshDecision(action, resource)
    if (fresh) return fresh
    return fetchDecision(action, resource)
  }

  return { can, decide }
}
