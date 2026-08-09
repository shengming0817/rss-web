import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import MockAdapter from 'axios-mock-adapter'
import { http } from '@gocell/request'
import { useHealthStore } from './useHealthStore'
import { HEALTH_CELLS_URL } from '../api/health'
import { SYSTEM_URL } from '../api/system'
import type { HealthCellsResponse } from '../api/health'
import type { SystemInfoResponse } from '../api/system'

// ---------------------------------------------------------------------------
// Mock payloads
// ---------------------------------------------------------------------------

const mkHealthResponse = (over: Partial<HealthCellsResponse> = {}): HealthCellsResponse => ({
  summary: {
    totalCells: 2,
    healthy: 1,
    degraded: 1,
    down: 0,
    lastCheckAt: '2026-06-03T12:00:00Z',
  },
  cells: [
    {
      name: 'accesscore',
      type: 'core',
      status: 'healthy',
      durability: 'Durable',
      version: '1.0.0',
      commit: 'abc123',
      startedAt: '2026-06-03T08:00:00Z',
      uptimeSeconds: 14400,
      lastHealthCheckAt: '2026-06-03T12:00:00Z',
      lastHealthCheckDurationMs: 3,
      sliceCount: 2,
      slices: [],
    },
    {
      name: 'auditcore',
      type: 'support',
      status: 'degraded',
      durability: 'Demo',
      version: '1.0.0',
      commit: 'def456',
      startedAt: '2026-06-03T09:00:00Z',
      uptimeSeconds: 10800,
      lastHealthCheckAt: '2026-06-03T12:00:00Z',
      lastHealthCheckDurationMs: 5,
      sliceCount: 1,
      slices: [],
    },
  ],
  ...over,
})

const mkSystemResponse = (over: Partial<SystemInfoResponse> = {}): SystemInfoResponse => ({
  build: {
    version: '1.2.3',
    commit: 'abc123',
    commitDate: '2026-06-01',
    buildDate: '2026-06-01',
    goVersion: 'go1.22.0',
    tags: [],
    dirty: false,
  },
  runtime: {
    uptimeSeconds: 14400,
    goroutines: 42,
    memoryMB: 128,
    memoryAllocBytes: 134217728,
    gcPauseTotalNs: 1000000,
    cpuPercent: 3.5,
    pid: 1001,
  },
  assembly: {
    name: 'gocell',
    cells: ['accesscore', 'auditcore'],
    primaryAddr: ':8080',
    internalAddr: ':9090',
  },
  environment: {
    env: 'production',
    hostname: 'gocell-host',
    containerized: true,
  },
  ...over,
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useHealthStore', () => {
  let mock: MockAdapter

  beforeEach(() => {
    setActivePinia(createPinia())
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
    vi.restoreAllMocks()
  })

  // ─── initial state ────────────────────────────────────────────────────────

  it('starts with empty / idle state', () => {
    const store = useHealthStore()
    expect(store.cells).toEqual([])
    expect(store.summary).toBeNull()
    expect(store.healthStatus).toBe('idle')
    expect(store.healthErrorKey).toBeNull()
    expect(store.system).toBeNull()
    expect(store.systemStatus).toBe('idle')
    expect(store.systemErrorKey).toBeNull()
    expect(store.lastCheckAt).toBeNull()
  })

  it('rollup is empty for initial empty cells', () => {
    const store = useHealthStore()
    expect(store.rollup).toEqual({ total: 0, healthy: 0, degraded: 0, down: 0 })
  })

  // ─── fetchHealth ──────────────────────────────────────────────────────────

  describe('fetchHealth', () => {
    it('toggles healthStatus to loading before await', async () => {
      mock.onGet(HEALTH_CELLS_URL).reply(200, mkHealthResponse())
      const store = useHealthStore()

      const p = store.fetchHealth()
      expect(store.healthStatus).toBe('loading')
      await p
    })

    it('populates cells and summary on success', async () => {
      mock.onGet(HEALTH_CELLS_URL).reply(200, mkHealthResponse())
      const store = useHealthStore()
      await store.fetchHealth()

      expect(store.healthStatus).toBe('loaded')
      expect(store.cells).toHaveLength(2)
      expect(store.cells[0]?.name).toBe('accesscore')
      expect(store.summary?.totalCells).toBe(2)
      expect(store.lastCheckAt).toBe('2026-06-03T12:00:00Z')
      expect(store.healthErrorKey).toBeNull()
    })

    it('rollup reflects loaded cells', async () => {
      mock.onGet(HEALTH_CELLS_URL).reply(200, mkHealthResponse())
      const store = useHealthStore()
      await store.fetchHealth()

      expect(store.rollup.total).toBe(2)
      expect(store.rollup.healthy).toBe(1)
      expect(store.rollup.degraded).toBe(1)
    })

    it('degrades to unavailable on 404 without throwing', async () => {
      mock.onGet(HEALTH_CELLS_URL).reply(404)
      const store = useHealthStore()
      await expect(store.fetchHealth()).resolves.toBeUndefined()

      expect(store.healthStatus).toBe('unavailable')
      expect(store.healthErrorKey).not.toBeNull()
    })

    it('degrades to unavailable on network error without throwing', async () => {
      mock.onGet(HEALTH_CELLS_URL).networkError()
      const store = useHealthStore()
      await expect(store.fetchHealth()).resolves.toBeUndefined()

      expect(store.healthStatus).toBe('unavailable')
      expect(store.healthErrorKey).not.toBeNull()
    })

    it('clears errorKey on a successful re-fetch after failure', async () => {
      mock
        .onGet(HEALTH_CELLS_URL)
        .replyOnce(500)
        .onGet(HEALTH_CELLS_URL)
        .reply(200, mkHealthResponse())
      const store = useHealthStore()
      await store.fetchHealth()
      expect(store.healthStatus).toBe('unavailable')
      await store.fetchHealth()
      expect(store.healthStatus).toBe('loaded')
      expect(store.healthErrorKey).toBeNull()
    })
  })

  // ─── fetchSystem ──────────────────────────────────────────────────────────

  describe('fetchSystem', () => {
    it('toggles systemStatus to loading before await', async () => {
      mock.onGet(SYSTEM_URL).reply(200, mkSystemResponse())
      const store = useHealthStore()

      const p = store.fetchSystem()
      expect(store.systemStatus).toBe('loading')
      await p
    })

    it('populates system on success', async () => {
      mock.onGet(SYSTEM_URL).reply(200, mkSystemResponse())
      const store = useHealthStore()
      await store.fetchSystem()

      expect(store.systemStatus).toBe('loaded')
      expect(store.system?.build.version).toBe('1.2.3')
      expect(store.system?.runtime.goroutines).toBe(42)
      expect(store.systemErrorKey).toBeNull()
    })

    it('degrades to unavailable on 404 without throwing', async () => {
      mock.onGet(SYSTEM_URL).reply(404)
      const store = useHealthStore()
      await expect(store.fetchSystem()).resolves.toBeUndefined()

      expect(store.systemStatus).toBe('unavailable')
      expect(store.systemErrorKey).not.toBeNull()
    })

    it('degrades to unavailable on network error without throwing', async () => {
      mock.onGet(SYSTEM_URL).networkError()
      const store = useHealthStore()
      await expect(store.fetchSystem()).resolves.toBeUndefined()

      expect(store.systemStatus).toBe('unavailable')
      expect(store.systemErrorKey).not.toBeNull()
    })
  })

  // ─── concurrency deduplication ───────────────────────────────────────────

  describe('fetchHealth deduplication', () => {
    it('concurrent fetchHealth calls result in only one HTTP request', async () => {
      // Verify single-flight: only one GET hits the endpoint even when two calls race.
      let requestCount = 0
      mock.onGet(HEALTH_CELLS_URL).reply(() => {
        requestCount++
        return new Promise<[number, HealthCellsResponse]>((resolve) =>
          setTimeout(() => resolve([200, mkHealthResponse()]), 50),
        )
      })
      const store = useHealthStore()

      const p1 = store.fetchHealth()
      const p2 = store.fetchHealth()

      await Promise.all([p1, p2])
      expect(requestCount).toBe(1)
      expect(store.healthStatus).toBe('loaded')
    })

    it('a new fetchHealth can be initiated after the previous one completes', async () => {
      mock.onGet(HEALTH_CELLS_URL).reply(200, mkHealthResponse())
      const store = useHealthStore()

      await store.fetchHealth()
      expect(store.healthStatus).toBe('loaded')

      // Second call after completion should work fine
      mock.onGet(HEALTH_CELLS_URL).reply(200, mkHealthResponse())
      await store.fetchHealth()
      expect(store.healthStatus).toBe('loaded')
    })
  })

  describe('fetchSystem deduplication', () => {
    it('concurrent fetchSystem calls result in only one HTTP request', async () => {
      let requestCount = 0
      mock.onGet(SYSTEM_URL).reply(() => {
        requestCount++
        return new Promise<[number, SystemInfoResponse]>((resolve) =>
          setTimeout(() => resolve([200, mkSystemResponse()]), 50),
        )
      })
      const store = useHealthStore()

      const p1 = store.fetchSystem()
      const p2 = store.fetchSystem()

      await Promise.all([p1, p2])
      expect(requestCount).toBe(1)
      expect(store.systemStatus).toBe('loaded')
    })
  })

  // ─── refresh ──────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('drives both health and system to loaded state', async () => {
      // Verify refresh() fans out to both endpoints by checking both status
      // transitions reach 'loaded' — Pinia wraps actions so spyOn doesn't
      // intercept them; side-effect observation is the reliable alternative.
      mock.onGet(HEALTH_CELLS_URL).reply(200, mkHealthResponse())
      mock.onGet(SYSTEM_URL).reply(200, mkSystemResponse())
      const store = useHealthStore()

      await store.refresh()

      expect(store.healthStatus).toBe('loaded')
      expect(store.systemStatus).toBe('loaded')
      // Both endpoints were hit: data should be populated
      expect(store.cells.length).toBeGreaterThan(0)
      expect(store.system).not.toBeNull()
    })

    it('completes even if health fails and system succeeds (allSettled)', async () => {
      mock.onGet(HEALTH_CELLS_URL).networkError()
      mock.onGet(SYSTEM_URL).reply(200, mkSystemResponse())
      const store = useHealthStore()
      await expect(store.refresh()).resolves.toBeUndefined()

      expect(store.healthStatus).toBe('unavailable')
      expect(store.systemStatus).toBe('loaded')
    })

    it('completes even if both fail (allSettled)', async () => {
      mock.onGet(HEALTH_CELLS_URL).networkError()
      mock.onGet(SYSTEM_URL).networkError()
      const store = useHealthStore()
      await expect(store.refresh()).resolves.toBeUndefined()

      expect(store.healthStatus).toBe('unavailable')
      expect(store.systemStatus).toBe('unavailable')
    })

    it('both succeed: healthStatus and systemStatus both loaded', async () => {
      mock.onGet(HEALTH_CELLS_URL).reply(200, mkHealthResponse())
      mock.onGet(SYSTEM_URL).reply(200, mkSystemResponse())
      const store = useHealthStore()
      await store.refresh()

      expect(store.healthStatus).toBe('loaded')
      expect(store.systemStatus).toBe('loaded')
    })
  })
})
