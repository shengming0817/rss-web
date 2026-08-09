/**
 * useFlag.spec.ts — AI-robust Hard档反向自检 + 行为测试.
 *
 * 档位: Hard — useFlag 形参类型为 FlagKey 字面量联合，传非法字面量 → compile-time error.
 * 反向自检通过 @ts-expect-error 断言非法字符串不可通过类型检查。
 *
 * 行为测试: 数据源来自 useFlagsStore.flags，按 key 查找 enabled；
 * 找不到 key → 默认 false (fail-safe).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { effectScope } from 'vue'
import { useFlag } from './useFlag'
import { FLAG_KEYS, type FlagKey } from '../flags/registry'
import { useFlagsStore } from '../stores/useFlagsStore'
import type { FeatureFlag } from '../api/flags'

// Mock the store's api layer so we don't fire real HTTP
vi.mock('../api/flags', () => ({
  listFlags: vi.fn(),
  getFlag: vi.fn(),
  createFlag: vi.fn(),
  updateFlag: vi.fn(),
  toggleFlag: vi.fn(),
  evaluateFlag: vi.fn(),
  deleteFlag: vi.fn(),
  FLAGS_URL: '/api/v1/flags/',
}))

const mkFlag = (over: Partial<FeatureFlag> = {}): FeatureFlag => ({
  id: 'flag-1',
  key: 'audit.chain-verify',
  type: 'boolean',
  enabled: true,
  rolloutPercentage: 100,
  description: 'test',
  version: 1,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-02T00:00:00Z',
  ...over,
})

describe('useFlag · AI-robust reverse-check (compile-time guard)', () => {
  it('accepts a valid FlagKey literal without type error', () => {
    setActivePinia(createPinia())
    const scope = effectScope()
    scope.run(() => {
      // Valid key — no compile error
      const validKey: FlagKey = FLAG_KEYS.auditChainVerify
      const { enabled } = useFlag(validKey)
      expect(typeof enabled.value).toBe('boolean')
    })
    scope.stop()
  })

  it('unknown string literal is rejected at compile time (@ts-expect-error)', () => {
    setActivePinia(createPinia())
    const scope = effectScope()
    scope.run(() => {
      // @ts-expect-error — 'totally-unknown-flag' is not assignable to FlagKey (Hard guard)
      const { enabled } = useFlag('totally-unknown-flag')
      // runtime: still works as string but compile-time blocked
      expect(typeof enabled.value).toBe('boolean')
    })
    scope.stop()
  })
})

describe('useFlag · enabled resolution', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('returns enabled=true when the flag is found in store and enabled=true', () => {
    const store = useFlagsStore()
    store.flags = [mkFlag({ key: FLAG_KEYS.auditChainVerify, enabled: true })]

    const scope = effectScope()
    let enabled: boolean | undefined
    scope.run(() => {
      const result = useFlag(FLAG_KEYS.auditChainVerify)
      enabled = result.enabled.value
    })
    scope.stop()

    expect(enabled).toBe(true)
  })

  it('returns enabled=false when the flag is found but enabled=false', () => {
    const store = useFlagsStore()
    store.flags = [mkFlag({ key: FLAG_KEYS.auditChainVerify, enabled: false })]

    const scope = effectScope()
    let enabled: boolean | undefined
    scope.run(() => {
      const result = useFlag(FLAG_KEYS.auditChainVerify)
      enabled = result.enabled.value
    })
    scope.stop()

    expect(enabled).toBe(false)
  })

  it('returns enabled=false (fail-safe) when the key is not in the store', () => {
    const store = useFlagsStore()
    store.flags = [] // empty — key not found

    const scope = effectScope()
    let enabled: boolean | undefined
    scope.run(() => {
      const result = useFlag(FLAG_KEYS.auditChainVerify)
      enabled = result.enabled.value
    })
    scope.stop()

    expect(enabled).toBe(false)
  })

  it('returns a readonly computed ref (value updates reactively)', async () => {
    const store = useFlagsStore()
    store.flags = [mkFlag({ key: FLAG_KEYS.auditChainVerify, enabled: true })]

    const scope = effectScope()
    let resultRef: ReturnType<typeof useFlag> | undefined
    scope.run(() => {
      resultRef = useFlag(FLAG_KEYS.auditChainVerify)
    })

    expect(resultRef?.enabled.value).toBe(true)

    // Mutate store — computed should update
    store.flags = [mkFlag({ key: FLAG_KEYS.auditChainVerify, enabled: false })]
    expect(resultRef?.enabled.value).toBe(false)

    scope.stop()
  })
})

describe('useFlag · store with multiple flags', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('resolves the correct flag by key when multiple flags exist', () => {
    const store = useFlagsStore()
    store.flags = [
      mkFlag({ id: 'f1', key: 'other.flag', enabled: false }),
      mkFlag({ id: 'f2', key: FLAG_KEYS.auditChainVerify, enabled: true }),
    ]

    const scope = effectScope()
    let enabled: boolean | undefined
    scope.run(() => {
      const result = useFlag(FLAG_KEYS.auditChainVerify)
      enabled = result.enabled.value
    })
    scope.stop()

    expect(enabled).toBe(true)
  })
})
