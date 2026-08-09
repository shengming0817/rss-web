import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { http } from '@gocell/request'
import { fetchCellHealth, HEALTH_CELLS_URL } from './health'
import type { HealthCellsResponse } from './health'

const mockResponse: HealthCellsResponse = {
  summary: {
    totalCells: 2,
    healthy: 1,
    degraded: 1,
    down: 0,
    lastCheckAt: '2026-06-03T10:00:00Z',
  },
  cells: [
    {
      name: 'accesscore',
      type: 'core',
      status: 'healthy',
      durability: 'Durable',
      version: '1.2.3',
      commit: 'a7f3c1d',
      startedAt: '2026-06-03T08:00:00Z',
      uptimeSeconds: 7200,
      lastHealthCheckAt: '2026-06-03T10:00:00Z',
      lastHealthCheckDurationMs: 12,
      sliceCount: 2,
      slices: [
        { name: 'auth', status: 'healthy', lastErrorAt: null, lastErrorMessage: null },
        { name: 'pdp', status: 'healthy', lastErrorAt: null, lastErrorMessage: null },
      ],
    },
    {
      name: 'auditcore',
      type: 'core',
      status: 'degraded',
      durability: 'Durable',
      version: '1.1.0',
      commit: 'b9d2e4f',
      startedAt: '2026-06-03T08:00:00Z',
      uptimeSeconds: 7200,
      lastHealthCheckAt: '2026-06-03T10:00:00Z',
      lastHealthCheckDurationMs: 45,
      sliceCount: 1,
      slices: [
        {
          name: 'auditquery',
          status: 'degraded',
          lastErrorAt: '2026-06-03T09:55:00Z',
          lastErrorMessage: 'db timeout',
        },
      ],
    },
  ],
}

describe('health api · fetchCellHealth', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('GETs the health cells URL and returns the full response', async () => {
    mock.onGet(HEALTH_CELLS_URL).reply(200, mockResponse)
    const res = await fetchCellHealth()
    expect(res).toEqual(mockResponse)
  })

  it('returns the correct summary totals', async () => {
    mock.onGet(HEALTH_CELLS_URL).reply(200, mockResponse)
    const res = await fetchCellHealth()
    expect(res.summary.totalCells).toBe(2)
    expect(res.summary.healthy).toBe(1)
    expect(res.summary.degraded).toBe(1)
  })

  it('returns the correct cells array length', async () => {
    mock.onGet(HEALTH_CELLS_URL).reply(200, mockResponse)
    const res = await fetchCellHealth()
    expect(res.cells).toHaveLength(2)
  })

  it('rejects on 404', async () => {
    mock.onGet(HEALTH_CELLS_URL).reply(404, { error: { code: 'not_found' } })
    await expect(fetchCellHealth()).rejects.toThrow()
  })

  it('rejects on network error', async () => {
    mock.onGet(HEALTH_CELLS_URL).networkError()
    await expect(fetchCellHealth()).rejects.toThrow()
  })

  it('rejects on 500', async () => {
    mock.onGet(HEALTH_CELLS_URL).reply(500, { error: { code: 'internal_error' } })
    await expect(fetchCellHealth()).rejects.toThrow()
  })

  // ─── runtime shape guard ──────────────────────────────────────────────────

  it('throws when response is missing "summary" field', async () => {
    mock.onGet(HEALTH_CELLS_URL).reply(200, { cells: [] })
    await expect(fetchCellHealth()).rejects.toThrow(/missing required fields/)
  })

  it('throws when response is missing "cells" field', async () => {
    mock.onGet(HEALTH_CELLS_URL).reply(200, { summary: {} })
    await expect(fetchCellHealth()).rejects.toThrow(/missing required fields/)
  })

  it('throws when response is null', async () => {
    mock.onGet(HEALTH_CELLS_URL).reply(200, null)
    await expect(fetchCellHealth()).rejects.toThrow(/missing required fields/)
  })

  it('throws when response is a plain string (standard envelope wrapping)', async () => {
    mock.onGet(HEALTH_CELLS_URL).reply(200, 'ok')
    await expect(fetchCellHealth()).rejects.toThrow(/missing required fields/)
  })

  it('returns data when both "summary" and "cells" are present', async () => {
    mock.onGet(HEALTH_CELLS_URL).reply(200, mockResponse)
    const res = await fetchCellHealth()
    expect(res.summary).toBeDefined()
    expect(res.cells).toBeDefined()
  })
})
