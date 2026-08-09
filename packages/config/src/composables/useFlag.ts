/**
 * useFlag.ts — typed feature flag composable.
 *
 * AI-robust档位: Hard — the `key` parameter is typed as FlagKey (literal union
 * from FLAG_KEYS `as const`). Passing an unknown string literal is a compile-time
 * error — the violation is NOT expressible in TypeScript.
 *
 * DATA SOURCE: consumes useFlagsStore's list cache (isEnabled getter).
 * Does NOT call /evaluate — that is an admin POST endpoint, not suitable for
 * high-frequency runtime checks.
 *
 * FAIL-SAFE: if the key is not found in the cache, returns enabled=false.
 *
 * BLINDED AREAS (反向自检见 useFlag.spec.ts):
 *   - Dynamic string casts (`key as FlagKey`) bypass compile-time guard.
 *   - Flag cache is empty on first render before fetchList resolves →
 *     fail-safe false is correct; components should call fetchList on mount.
 *
 * Reference: PRD §308.
 */
import { computed, type ComputedRef } from 'vue'
import { useFlagsStore } from '../stores/useFlagsStore'
import type { FlagKey } from '../flags/registry'

export interface UseFlagResult {
  /** Readonly computed: true when the flag is enabled in the store cache. */
  readonly enabled: ComputedRef<boolean>
}

/**
 * Returns a readonly computed ref reflecting whether the flag `key` is enabled.
 *
 * @param key - Must be a registered FlagKey literal from FLAG_KEYS.
 *   Passing an unknown string literal is a TypeScript compile-time error (Hard档).
 *
 * @example
 *   import { FLAG_KEYS } from '@gocell/config/composables'
 *   const { enabled } = useFlag(FLAG_KEYS.auditChainVerify)
 *   if (enabled.value) { ... }
 */
export function useFlag(key: FlagKey): UseFlagResult {
  const store = useFlagsStore()
  const enabled = computed<boolean>(() => store.isEnabled(key))
  return { enabled }
}
