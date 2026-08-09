import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConfigStore } from './useConfigStore'
import type { ConfigEntry } from '../api/config'

// Mock the api module — same pattern as usePoliciesStore.spec.ts
vi.mock('../api/config', () => ({
  listConfig: vi.fn(),
  getConfig: vi.fn(),
  writeConfig: vi.fn(),
  updateConfig: vi.fn(),
  deleteConfig: vi.fn(),
  publishConfig: vi.fn(),
  rollbackConfig: vi.fn(),
  CONFIG_URL: '/api/v1/config/',
}))

import {
  listConfig,
  writeConfig,
  updateConfig,
  deleteConfig,
  publishConfig,
  rollbackConfig,
} from '../api/config'

const mkEntry = (over: Partial<ConfigEntry> = {}): ConfigEntry => ({
  id: 'cfg-1',
  key: 'app.debug',
  value: 'true',
  sensitive: false,
  version: 1,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-02T00:00:00Z',
  ...over,
})

const listPage = (entries: ConfigEntry[], hasMore = false) => ({
  data: entries,
  nextCursor: hasMore ? 'cur-2' : '',
  hasMore,
})

describe('useConfigStore · initial state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('starts with empty state', () => {
    const store = useConfigStore()
    expect(store.entries).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.errorKey).toBeNull()
    expect(store.nextCursor).toBe('')
    expect(store.hasMore).toBe(false)
    expect(store.filter).toBe('')
    expect(store.mutating).toBe(false)
  })
})

describe('useConfigStore · filteredEntries', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns all entries when filter is empty', () => {
    const store = useConfigStore()
    store.entries = [mkEntry(), mkEntry({ id: 'cfg-2', key: 'app.name' })]
    expect(store.filteredEntries).toHaveLength(2)
  })

  it('filters entries by key (case-insensitive)', () => {
    const store = useConfigStore()
    store.entries = [mkEntry({ key: 'APP.DEBUG' }), mkEntry({ id: 'cfg-2', key: 'app.name' })]
    store.filter = 'debug'
    expect(store.filteredEntries).toHaveLength(1)
    expect(store.filteredEntries[0]?.key).toBe('APP.DEBUG')
  })

  it('trims the filter before matching', () => {
    const store = useConfigStore()
    store.entries = [mkEntry({ key: 'app.debug' })]
    store.filter = '  debug  '
    expect(store.filteredEntries).toHaveLength(1)
  })

  it('returns empty array when no keys match', () => {
    const store = useConfigStore()
    store.entries = [mkEntry({ key: 'app.debug' })]
    store.filter = 'xyzzy'
    expect(store.filteredEntries).toHaveLength(0)
  })
})

describe('useConfigStore · fetchList', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('populates entries on success and clears error', async () => {
    const entries = [mkEntry(), mkEntry({ id: 'cfg-2', key: 'app.name', value: 'gocell' })]
    vi.mocked(listConfig).mockResolvedValueOnce(listPage(entries))

    const store = useConfigStore()
    await store.fetchList()

    expect(store.entries).toEqual(entries)
    expect(store.loading).toBe(false)
    expect(store.errorKey).toBeNull()
  })

  it('sets loading=true during request, then false after', async () => {
    let resolve!: (v: ReturnType<typeof listPage>) => void
    vi.mocked(listConfig).mockReturnValueOnce(
      new Promise<ReturnType<typeof listPage>>((res) => {
        resolve = res
      }),
    )

    const store = useConfigStore()
    const p = store.fetchList()
    expect(store.loading).toBe(true)
    resolve(listPage([mkEntry()]))
    await p
    expect(store.loading).toBe(false)
  })

  it('swallows errors into errorKey', async () => {
    vi.mocked(listConfig).mockRejectedValueOnce(
      Object.assign(new Error('403'), {
        isAxiosError: true,
        response: { data: { error: { code: 'ERR_AUTH_FORBIDDEN' } }, status: 403 },
      }),
    )
    const store = useConfigStore()
    await store.fetchList()

    expect(store.errorKey).toBe('errors.ERR_AUTH_FORBIDDEN')
    expect(store.loading).toBe(false)
  })

  it('sets errorKey to errors.unknown for a plain Error', async () => {
    vi.mocked(listConfig).mockRejectedValueOnce(new Error('plain fail'))
    const store = useConfigStore()
    await store.fetchList()
    expect(store.errorKey).toBe('errors.unknown')
  })

  it('stores nextCursor and hasMore from the page', async () => {
    vi.mocked(listConfig).mockResolvedValueOnce({
      data: [mkEntry()],
      nextCursor: 'cur-next',
      hasMore: true,
    })
    const store = useConfigStore()
    await store.fetchList()
    expect(store.nextCursor).toBe('cur-next')
    expect(store.hasMore).toBe(true)
  })

  it('clears errorKey on subsequent successful fetch', async () => {
    vi.mocked(listConfig).mockRejectedValueOnce(new Error('fail'))
    const store = useConfigStore()
    await store.fetchList()
    expect(store.errorKey).not.toBeNull()

    vi.mocked(listConfig).mockResolvedValueOnce(listPage([mkEntry()]))
    await store.fetchList()
    expect(store.errorKey).toBeNull()
  })
})

describe('useConfigStore · loadMore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('is a no-op when hasMore=false', async () => {
    const store = useConfigStore()
    store.hasMore = false
    await store.loadMore()
    expect(listConfig).not.toHaveBeenCalled()
  })

  it('is a no-op when loading=true', async () => {
    const store = useConfigStore()
    store.hasMore = true
    store.loading = true
    await store.loadMore()
    expect(listConfig).not.toHaveBeenCalled()
  })

  it('appends entries to the existing list', async () => {
    const store = useConfigStore()
    store.entries = [mkEntry()]
    store.hasMore = true
    store.nextCursor = 'cur-2'

    const next = mkEntry({ id: 'cfg-2', key: 'app.name' })
    vi.mocked(listConfig).mockResolvedValueOnce(listPage([next]))

    await store.loadMore()
    expect(store.entries).toHaveLength(2)
    expect(store.entries[1]?.key).toBe('app.name')
  })
})

describe('useConfigStore · create mutation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('calls writeConfig with the body then refreshes', async () => {
    vi.mocked(writeConfig).mockResolvedValueOnce(undefined)
    vi.mocked(listConfig).mockResolvedValueOnce(listPage([mkEntry()]))

    const store = useConfigStore()
    await store.create({ key: 'app.name', value: 'gocell' })

    expect(writeConfig).toHaveBeenCalledWith({ key: 'app.name', value: 'gocell' })
    expect(listConfig).toHaveBeenCalled()
  })

  it('re-throws on failure (does NOT swallow)', async () => {
    vi.mocked(writeConfig).mockRejectedValueOnce(new Error('conflict'))
    const store = useConfigStore()
    await expect(store.create({ key: 'x', value: 'y' })).rejects.toThrow('conflict')
    expect(store.errorKey).toBeNull()
  })

  it('does not refresh list when create fails', async () => {
    vi.mocked(writeConfig).mockRejectedValueOnce(new Error('fail'))
    const store = useConfigStore()
    await expect(store.create({ key: 'x', value: 'y' })).rejects.toThrow()
    expect(listConfig).not.toHaveBeenCalled()
  })

  it('guards against writing the redacted placeholder (sensitive write guard)', async () => {
    const store = useConfigStore()
    await expect(store.create({ key: 'secret', value: '******' })).rejects.toThrow()
    expect(writeConfig).not.toHaveBeenCalled()
  })
})

describe('useConfigStore · update mutation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('calls updateConfig with key, value, expectedVersion then refreshes', async () => {
    vi.mocked(updateConfig).mockResolvedValueOnce(undefined)
    vi.mocked(listConfig).mockResolvedValueOnce(listPage([mkEntry()]))

    const store = useConfigStore()
    await store.update('app.debug', { value: 'false', expectedVersion: 1 })

    expect(updateConfig).toHaveBeenCalledWith('app.debug', { value: 'false', expectedVersion: 1 })
    expect(listConfig).toHaveBeenCalled()
  })

  it('re-throws on 409 CAS conflict', async () => {
    vi.mocked(updateConfig).mockRejectedValueOnce(
      Object.assign(new Error('409'), {
        isAxiosError: true,
        response: { data: { error: { code: 'ERR_VERSION_CONFLICT' } }, status: 409 },
      }),
    )
    const store = useConfigStore()
    await expect(store.update('app.debug', { value: 'x', expectedVersion: 0 })).rejects.toThrow()
    expect(store.errorKey).toBeNull()
  })

  it('guards against writing the redacted placeholder', async () => {
    const store = useConfigStore()
    await expect(store.update('secret', { value: '******', expectedVersion: 1 })).rejects.toThrow()
    expect(updateConfig).not.toHaveBeenCalled()
  })
})

describe('useConfigStore · publish mutation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  const snap = {
    id: 'snap-1',
    configId: 'cfg-1',
    version: 1,
    value: 'true',
    sensitive: false,
    publishedAt: '2026-05-03T00:00:00Z',
  }

  it('calls publishConfig and refreshes on success', async () => {
    vi.mocked(publishConfig).mockResolvedValueOnce(snap)
    vi.mocked(listConfig).mockResolvedValueOnce(listPage([mkEntry()]))

    const store = useConfigStore()
    await store.publish('app.debug')

    expect(publishConfig).toHaveBeenCalledWith('app.debug')
    expect(listConfig).toHaveBeenCalled()
  })

  it('re-throws on failure', async () => {
    vi.mocked(publishConfig).mockRejectedValueOnce(new Error('publish failed'))
    const store = useConfigStore()
    await expect(store.publish('app.debug')).rejects.toThrow('publish failed')
    expect(store.errorKey).toBeNull()
  })
})

describe('useConfigStore · rollback mutation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('calls rollbackConfig with key, version, expectedVersion then refreshes', async () => {
    vi.mocked(rollbackConfig).mockResolvedValueOnce(undefined)
    vi.mocked(listConfig).mockResolvedValueOnce(listPage([mkEntry()]))

    const store = useConfigStore()
    await store.rollback('app.debug', { version: 1, expectedVersion: 2 })

    expect(rollbackConfig).toHaveBeenCalledWith('app.debug', { version: 1, expectedVersion: 2 })
    expect(listConfig).toHaveBeenCalled()
  })

  it('re-throws on 409 CAS conflict', async () => {
    vi.mocked(rollbackConfig).mockRejectedValueOnce(
      Object.assign(new Error('409'), {
        isAxiosError: true,
        response: { data: { error: { code: 'ERR_VERSION_CONFLICT' } }, status: 409 },
      }),
    )
    const store = useConfigStore()
    await expect(store.rollback('app.debug', { version: 1, expectedVersion: 0 })).rejects.toThrow()
    expect(store.errorKey).toBeNull()
  })
})

describe('useConfigStore · remove mutation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('calls deleteConfig then refreshes', async () => {
    vi.mocked(deleteConfig).mockResolvedValueOnce(undefined)
    vi.mocked(listConfig).mockResolvedValueOnce(listPage([]))

    const store = useConfigStore()
    await store.remove('app.debug')

    expect(deleteConfig).toHaveBeenCalledWith('app.debug')
    expect(listConfig).toHaveBeenCalled()
  })

  it('re-throws on failure', async () => {
    vi.mocked(deleteConfig).mockRejectedValueOnce(new Error('delete failed'))
    const store = useConfigStore()
    await expect(store.remove('app.debug')).rejects.toThrow('delete failed')
  })
})

describe('useConfigStore · mutating flag', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('mutating is true during mutation and false after success', async () => {
    let resolve!: () => void
    vi.mocked(writeConfig).mockReturnValueOnce(
      new Promise<void>((res) => {
        resolve = res
      }),
    )
    vi.mocked(listConfig).mockResolvedValueOnce(listPage([mkEntry()]))

    const store = useConfigStore()
    const p = store.create({ key: 'x', value: 'y' })
    expect(store.mutating).toBe(true)
    resolve()
    await p
    expect(store.mutating).toBe(false)
  })

  it('mutating resets to false after mutation failure', async () => {
    vi.mocked(writeConfig).mockRejectedValueOnce(new Error('fail'))
    const store = useConfigStore()
    await expect(store.create({ key: 'x', value: 'y' })).rejects.toThrow()
    expect(store.mutating).toBe(false)
  })

  it('concurrent mutation is a no-op while first is in-flight (P-F2)', async () => {
    let resolveFirst!: () => void
    vi.mocked(writeConfig).mockReturnValueOnce(
      new Promise<void>((res) => {
        resolveFirst = res
      }),
    )
    vi.mocked(listConfig).mockResolvedValue(listPage([mkEntry()]))

    const store = useConfigStore()
    const p1 = store.create({ key: 'first', value: 'v1' })
    // Second call while first is in-flight — must be ignored
    await store.create({ key: 'second', value: 'v2' })

    resolveFirst()
    await p1

    // writeConfig called only once (first)
    expect(writeConfig).toHaveBeenCalledTimes(1)
    expect(writeConfig).toHaveBeenCalledWith({ key: 'first', value: 'v1' })
  })
})
