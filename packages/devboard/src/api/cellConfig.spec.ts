import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { http } from '@gocell/request'
import { fetchCellConfig, CELL_CONFIG_URL } from './cellConfig'

const page = {
  data: [
    {
      id: 'cfg-001',
      key: 'max_retries',
      value: '3',
      sensitive: false,
      version: 2,
      createdAt: '2026-05-10T08:00:00Z',
      updatedAt: '2026-06-01T10:00:00Z',
    },
    {
      id: 'cfg-002',
      key: 'db_password',
      value: '******',
      sensitive: true,
      version: 1,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    },
  ],
  nextCursor: 'cur-3',
  hasMore: false,
}

describe('cellConfig · fetchCellConfig', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('GETs CELL_CONFIG_URL and returns the response envelope', async () => {
    mock.onGet(CELL_CONFIG_URL).reply(200, page)
    const res = await fetchCellConfig()
    expect(res).toEqual(page)
  })

  it('forwards limit param as a query parameter', async () => {
    let seenParams: Record<string, unknown> | undefined
    mock.onGet(CELL_CONFIG_URL).reply((config) => {
      seenParams = config.params as Record<string, unknown>
      return [200, page]
    })
    await fetchCellConfig({ limit: 50 })
    expect(seenParams).toEqual({ limit: 50 })
  })

  it('sends no query params when called without args', async () => {
    let seenParams: Record<string, unknown> | undefined
    mock.onGet(CELL_CONFIG_URL).reply((config) => {
      seenParams = config.params as Record<string, unknown>
      return [200, page]
    })
    await fetchCellConfig()
    expect(seenParams).toEqual({})
  })

  it('rejects on network failure', async () => {
    mock.onGet(CELL_CONFIG_URL).networkError()
    await expect(fetchCellConfig()).rejects.toThrow()
  })
})
