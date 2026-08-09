import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFlagsStore } from './useFlagsStore'
import type { FeatureFlag } from '../api/flags'

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

import { listFlags, createFlag, updateFlag, toggleFlag, deleteFlag } from '../api/flags'

const mkFlag = (over: Partial<FeatureFlag> = {}): FeatureFlag => ({
  id: 'flag-1',
  key: 'audit.chain-verify',
  type: 'boolean',
  enabled: true,
  rolloutPercentage: 75,
  description: 'Enable audit chain verification',
  version: 1,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-02T00:00:00Z',
  ...over,
})

const listPage = (flags: FeatureFlag[], hasMore = false) => ({
  data: flags,
  nextCursor: hasMore ? 'cur-2' : '',
  hasMore,
})

describe('useFlagsStore · initial state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('starts with empty state', () => {
    const store = useFlagsStore()
    expect(store.flags).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.errorKey).toBeNull()
    expect(store.nextCursor).toBe('')
    expect(store.hasMore).toBe(false)
    expect(store.filter).toBe('')
    expect(store.mutating).toBe(false)
  })
})

describe('useFlagsStore · filteredFlags', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns all flags when filter is empty', () => {
    const store = useFlagsStore()
    store.flags = [mkFlag(), mkFlag({ id: 'f2', key: 'payments.new-checkout' })]
    expect(store.filteredFlags).toHaveLength(2)
  })

  it('filters flags by key (case-insensitive)', () => {
    const store = useFlagsStore()
    store.flags = [
      mkFlag({ key: 'AUDIT.CHAIN-VERIFY' }),
      mkFlag({ id: 'f2', key: 'payments.new-checkout' }),
    ]
    store.filter = 'audit'
    expect(store.filteredFlags).toHaveLength(1)
    expect(store.filteredFlags[0]?.key).toBe('AUDIT.CHAIN-VERIFY')
  })

  it('trims the filter before matching', () => {
    const store = useFlagsStore()
    store.flags = [mkFlag({ key: 'audit.chain-verify' })]
    store.filter = '  audit  '
    expect(store.filteredFlags).toHaveLength(1)
  })

  it('returns empty array when no keys match', () => {
    const store = useFlagsStore()
    store.flags = [mkFlag()]
    store.filter = 'xyzzy'
    expect(store.filteredFlags).toHaveLength(0)
  })
})

describe('useFlagsStore · isEnabled', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns true for a flag that is enabled', () => {
    const store = useFlagsStore()
    store.flags = [mkFlag({ key: 'audit.chain-verify', enabled: true })]
    expect(store.isEnabled('audit.chain-verify')).toBe(true)
  })

  it('returns false for a flag that is disabled', () => {
    const store = useFlagsStore()
    store.flags = [mkFlag({ key: 'audit.chain-verify', enabled: false })]
    expect(store.isEnabled('audit.chain-verify')).toBe(false)
  })

  it('returns false (fail-safe) when the key is not in the store', () => {
    const store = useFlagsStore()
    store.flags = []
    expect(store.isEnabled('unknown-key')).toBe(false)
  })
})

describe('useFlagsStore · fetchList', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('populates flags on success and clears error', async () => {
    const flags = [mkFlag(), mkFlag({ id: 'f2', key: 'payments.new-checkout', enabled: false })]
    vi.mocked(listFlags).mockResolvedValueOnce(listPage(flags))

    const store = useFlagsStore()
    await store.fetchList()

    expect(store.flags).toEqual(flags)
    expect(store.loading).toBe(false)
    expect(store.errorKey).toBeNull()
  })

  it('sets loading=true during request, then false after', async () => {
    let resolve!: (v: ReturnType<typeof listPage>) => void
    vi.mocked(listFlags).mockReturnValueOnce(
      new Promise<ReturnType<typeof listPage>>((res) => {
        resolve = res
      }),
    )

    const store = useFlagsStore()
    const p = store.fetchList()
    expect(store.loading).toBe(true)
    resolve(listPage([mkFlag()]))
    await p
    expect(store.loading).toBe(false)
  })

  it('swallows errors into errorKey', async () => {
    vi.mocked(listFlags).mockRejectedValueOnce(
      Object.assign(new Error('403'), {
        isAxiosError: true,
        response: { data: { error: { code: 'ERR_AUTH_FORBIDDEN' } }, status: 403 },
      }),
    )
    const store = useFlagsStore()
    await store.fetchList()

    expect(store.errorKey).toBe('errors.ERR_AUTH_FORBIDDEN')
    expect(store.loading).toBe(false)
  })

  it('sets errorKey to errors.unknown for a plain Error', async () => {
    vi.mocked(listFlags).mockRejectedValueOnce(new Error('plain fail'))
    const store = useFlagsStore()
    await store.fetchList()
    expect(store.errorKey).toBe('errors.unknown')
  })

  it('stores nextCursor and hasMore from the page', async () => {
    vi.mocked(listFlags).mockResolvedValueOnce({
      data: [mkFlag()],
      nextCursor: 'cur-next',
      hasMore: true,
    })
    const store = useFlagsStore()
    await store.fetchList()
    expect(store.nextCursor).toBe('cur-next')
    expect(store.hasMore).toBe(true)
  })

  it('clears errorKey on subsequent successful fetch', async () => {
    vi.mocked(listFlags).mockRejectedValueOnce(new Error('fail'))
    const store = useFlagsStore()
    await store.fetchList()
    expect(store.errorKey).not.toBeNull()

    vi.mocked(listFlags).mockResolvedValueOnce(listPage([mkFlag()]))
    await store.fetchList()
    expect(store.errorKey).toBeNull()
  })
})

describe('useFlagsStore · loadMore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('is a no-op when hasMore=false', async () => {
    const store = useFlagsStore()
    store.hasMore = false
    await store.loadMore()
    expect(listFlags).not.toHaveBeenCalled()
  })

  it('is a no-op when loading=true', async () => {
    const store = useFlagsStore()
    store.hasMore = true
    store.loading = true
    await store.loadMore()
    expect(listFlags).not.toHaveBeenCalled()
  })

  it('appends flags to the existing list', async () => {
    const store = useFlagsStore()
    store.flags = [mkFlag()]
    store.hasMore = true
    store.nextCursor = 'cur-2'

    const next = mkFlag({ id: 'f2', key: 'payments.new-checkout' })
    vi.mocked(listFlags).mockResolvedValueOnce(listPage([next]))

    await store.loadMore()
    expect(store.flags).toHaveLength(2)
    expect(store.flags[1]?.key).toBe('payments.new-checkout')
  })
})

describe('useFlagsStore · create mutation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('calls createFlag with the body then refreshes', async () => {
    vi.mocked(createFlag).mockResolvedValueOnce(undefined)
    vi.mocked(listFlags).mockResolvedValueOnce(listPage([mkFlag()]))

    const store = useFlagsStore()
    await store.create({ key: 'payments.new-checkout', description: 'test' })

    expect(createFlag).toHaveBeenCalledWith({
      key: 'payments.new-checkout',
      description: 'test',
    })
    expect(listFlags).toHaveBeenCalled()
  })

  it('re-throws on failure (does NOT swallow)', async () => {
    vi.mocked(createFlag).mockRejectedValueOnce(new Error('conflict'))
    const store = useFlagsStore()
    await expect(store.create({ key: 'x' })).rejects.toThrow('conflict')
    expect(store.errorKey).toBeNull()
  })

  it('does not refresh list when create fails', async () => {
    vi.mocked(createFlag).mockRejectedValueOnce(new Error('fail'))
    const store = useFlagsStore()
    await expect(store.create({ key: 'x' })).rejects.toThrow()
    expect(listFlags).not.toHaveBeenCalled()
  })
})

describe('useFlagsStore · update mutation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('calls updateFlag with key and body then refreshes', async () => {
    vi.mocked(updateFlag).mockResolvedValueOnce(undefined)
    vi.mocked(listFlags).mockResolvedValueOnce(listPage([mkFlag()]))

    const store = useFlagsStore()
    await store.update('audit.chain-verify', {
      enabled: true,
      rolloutPercentage: 50,
      description: 'updated',
      expectedVersion: 1,
    })

    expect(updateFlag).toHaveBeenCalledWith('audit.chain-verify', {
      enabled: true,
      rolloutPercentage: 50,
      description: 'updated',
      expectedVersion: 1,
    })
    expect(listFlags).toHaveBeenCalled()
  })

  it('re-throws on 409 CAS conflict', async () => {
    vi.mocked(updateFlag).mockRejectedValueOnce(
      Object.assign(new Error('409'), {
        isAxiosError: true,
        response: { data: { error: { code: 'ERR_VERSION_CONFLICT' } }, status: 409 },
      }),
    )
    const store = useFlagsStore()
    await expect(
      store.update('audit.chain-verify', {
        enabled: true,
        rolloutPercentage: 100,
        description: 'd',
        expectedVersion: 0,
      }),
    ).rejects.toThrow()
    expect(store.errorKey).toBeNull()
  })
})

describe('useFlagsStore · toggle mutation (kill switch)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('calls toggleFlag with key, enabled=false, expectedVersion for kill switch', async () => {
    vi.mocked(toggleFlag).mockResolvedValueOnce(undefined)
    vi.mocked(listFlags).mockResolvedValueOnce(listPage([mkFlag({ enabled: false })]))

    const store = useFlagsStore()
    await store.toggle('audit.chain-verify', { enabled: false, expectedVersion: 1 })

    expect(toggleFlag).toHaveBeenCalledWith('audit.chain-verify', {
      enabled: false,
      expectedVersion: 1,
    })
    expect(listFlags).toHaveBeenCalled()
  })

  it('re-throws on 409 CAS conflict', async () => {
    vi.mocked(toggleFlag).mockRejectedValueOnce(
      Object.assign(new Error('409'), {
        isAxiosError: true,
        response: { data: { error: { code: 'ERR_VERSION_CONFLICT' } }, status: 409 },
      }),
    )
    const store = useFlagsStore()
    await expect(
      store.toggle('audit.chain-verify', { enabled: false, expectedVersion: 0 }),
    ).rejects.toThrow()
    expect(store.errorKey).toBeNull()
  })

  it('re-throws on generic failure', async () => {
    vi.mocked(toggleFlag).mockRejectedValueOnce(new Error('fail'))
    const store = useFlagsStore()
    await expect(
      store.toggle('audit.chain-verify', { enabled: false, expectedVersion: 1 }),
    ).rejects.toThrow()
  })
})

describe('useFlagsStore · remove mutation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('calls deleteFlag then refreshes', async () => {
    vi.mocked(deleteFlag).mockResolvedValueOnce(undefined)
    vi.mocked(listFlags).mockResolvedValueOnce(listPage([]))

    const store = useFlagsStore()
    await store.remove('audit.chain-verify')

    expect(deleteFlag).toHaveBeenCalledWith('audit.chain-verify')
    expect(listFlags).toHaveBeenCalled()
  })

  it('re-throws on failure', async () => {
    vi.mocked(deleteFlag).mockRejectedValueOnce(new Error('delete failed'))
    const store = useFlagsStore()
    await expect(store.remove('audit.chain-verify')).rejects.toThrow('delete failed')
  })
})

describe('useFlagsStore · mutating flag', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('mutating is true during mutation and false after success', async () => {
    let resolve!: () => void
    vi.mocked(createFlag).mockReturnValueOnce(
      new Promise<void>((res) => {
        resolve = res
      }),
    )
    vi.mocked(listFlags).mockResolvedValueOnce(listPage([mkFlag()]))

    const store = useFlagsStore()
    const p = store.create({ key: 'x' })
    expect(store.mutating).toBe(true)
    resolve()
    await p
    expect(store.mutating).toBe(false)
  })

  it('mutating resets to false after mutation failure', async () => {
    vi.mocked(createFlag).mockRejectedValueOnce(new Error('fail'))
    const store = useFlagsStore()
    await expect(store.create({ key: 'x' })).rejects.toThrow()
    expect(store.mutating).toBe(false)
  })

  it('concurrent mutation is a no-op while first is in-flight', async () => {
    let resolveFirst!: () => void
    vi.mocked(createFlag).mockReturnValueOnce(
      new Promise<void>((res) => {
        resolveFirst = res
      }),
    )
    vi.mocked(listFlags).mockResolvedValue(listPage([mkFlag()]))

    const store = useFlagsStore()
    const p1 = store.create({ key: 'first' })
    // Second call while first is in-flight — must be ignored
    await store.create({ key: 'second' })

    resolveFirst()
    await p1

    // createFlag called only once (first)
    expect(createFlag).toHaveBeenCalledTimes(1)
    expect(createFlag).toHaveBeenCalledWith({ key: 'first' })
  })
})
