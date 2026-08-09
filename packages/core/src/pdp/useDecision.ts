import { computed, inject, toValue } from 'vue'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import { PDP_INJECTION_KEY } from './types'

// Module-level flag: warn only once per module lifetime to avoid console spam.
// Prevents repeated calls to useDecision (e.g., many components mounting)
// from flooding the console when no provider is set up.
let _warnedMissingProvider = false

/**
 * Reset the warn-once flag. Exported for testing only — not in index.ts.
 * @internal
 */
export function _resetWarnFlagForTesting(): void {
  _warnedMissingProvider = false
}

/**
 * 消费 PDP 客户端，返回响应式布尔 ComputedRef。
 *
 * fail-closed 铁律：
 * - 无 PDP provider → 返回 computed(() => false)，并 console.warn 一次（不刷屏）
 * - provider.can() pending / error → 由实现方保证返回 false
 *
 * @param action   操作名（响应式，支持 ref / getter / 字符串字面量）
 * @param resource 资源标识（可选，响应式）
 */
export function useDecision(
  action: MaybeRefOrGetter<string>,
  resource?: MaybeRefOrGetter<string | undefined>,
): ComputedRef<boolean> {
  const client = inject(PDP_INJECTION_KEY)

  if (!client) {
    // fail-closed: warn once per session, return always-false
    if (!_warnedMissingProvider) {
      _warnedMissingProvider = true
      console.warn(
        '[gocell/core] useDecision: No PDP provider found. ' +
          'Make sure @gocell/access provides PDP_INJECTION_KEY in your app root. ' +
          'Defaulting to deny (fail-closed).',
      )
    }
    return computed(() => false)
  }

  // Reactive: recomputes whenever action or resource changes
  return computed(() => {
    const resolvedAction = toValue(action)
    const resolvedResource = resource !== undefined ? toValue(resource) : undefined
    return client.can(resolvedAction, resolvedResource).value
  })
}
