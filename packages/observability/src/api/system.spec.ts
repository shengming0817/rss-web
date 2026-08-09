import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { http } from '@gocell/request'
import { fetchSystemInfo, SYSTEM_URL } from './system'
import type { SystemInfoResponse } from './system'

const mockResponse: SystemInfoResponse = {
  build: {
    version: '1.3.0',
    commit: 'a7f3c1d',
    commitDate: '2026-05-30T14:22:00Z',
    buildDate: '2026-05-30T15:00:00Z',
    goVersion: 'go1.22.3',
    tags: ['netgo', 'osusergo'],
    dirty: false,
  },
  runtime: {
    uptimeSeconds: 86400,
    goroutines: 128,
    memoryMB: 87,
    memoryAllocBytes: 91750400,
    gcPauseTotalNs: 1200000,
    cpuPercent: 2.4,
    pid: 1,
  },
  assembly: {
    name: 'gocell',
    cells: ['accesscore', 'auditcore', 'configcore'],
    primaryAddr: ':8080',
    internalAddr: ':9090',
  },
  environment: {
    env: 'production',
    hostname: 'gocell-pod-7d9f',
    containerized: true,
  },
}

describe('system api · fetchSystemInfo', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('GETs the system URL and returns the full response', async () => {
    mock.onGet(SYSTEM_URL).reply(200, mockResponse)
    const res = await fetchSystemInfo()
    expect(res).toEqual(mockResponse)
  })

  it('returns the correct build info', async () => {
    mock.onGet(SYSTEM_URL).reply(200, mockResponse)
    const res = await fetchSystemInfo()
    expect(res.build.version).toBe('1.3.0')
    expect(res.build.dirty).toBe(false)
    expect(res.build.tags).toEqual(['netgo', 'osusergo'])
  })

  it('returns the correct runtime info', async () => {
    mock.onGet(SYSTEM_URL).reply(200, mockResponse)
    const res = await fetchSystemInfo()
    expect(res.runtime.memoryMB).toBe(87)
    expect(res.runtime.goroutines).toBe(128)
  })

  it('returns assembly cells list', async () => {
    mock.onGet(SYSTEM_URL).reply(200, mockResponse)
    const res = await fetchSystemInfo()
    expect(res.assembly.cells).toContain('accesscore')
  })

  it('rejects on 404', async () => {
    mock.onGet(SYSTEM_URL).reply(404, { error: { code: 'not_found' } })
    await expect(fetchSystemInfo()).rejects.toThrow()
  })

  it('rejects on 500', async () => {
    mock.onGet(SYSTEM_URL).reply(500, { error: { code: 'internal_error' } })
    await expect(fetchSystemInfo()).rejects.toThrow()
  })

  it('rejects on network error', async () => {
    mock.onGet(SYSTEM_URL).networkError()
    await expect(fetchSystemInfo()).rejects.toThrow()
  })

  // ─── runtime shape guard ──────────────────────────────────────────────────

  it('throws when response is missing "build" field', async () => {
    mock.onGet(SYSTEM_URL).reply(200, { runtime: {} })
    await expect(fetchSystemInfo()).rejects.toThrow(/missing required fields/)
  })

  it('throws when response is missing "runtime" field', async () => {
    mock.onGet(SYSTEM_URL).reply(200, { build: {} })
    await expect(fetchSystemInfo()).rejects.toThrow(/missing required fields/)
  })

  it('throws when response is null', async () => {
    mock.onGet(SYSTEM_URL).reply(200, null)
    await expect(fetchSystemInfo()).rejects.toThrow(/missing required fields/)
  })

  it('throws when response is a plain string (standard envelope wrapping)', async () => {
    mock.onGet(SYSTEM_URL).reply(200, 'ok')
    await expect(fetchSystemInfo()).rejects.toThrow(/missing required fields/)
  })

  it('returns data when both "build" and "runtime" are present', async () => {
    mock.onGet(SYSTEM_URL).reply(200, mockResponse)
    const res = await fetchSystemInfo()
    expect(res.build).toBeDefined()
    expect(res.runtime).toBeDefined()
  })
})
