import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { http } from '@gocell/request'
import {
  listConfig,
  getConfig,
  writeConfig,
  updateConfig,
  deleteConfig,
  publishConfig,
  rollbackConfig,
  CONFIG_URL,
} from './config'

const entry = {
  id: 'cfg-1',
  key: 'app.debug',
  value: 'true',
  sensitive: false,
  version: 1,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-02T00:00:00Z',
}

const listPage = {
  data: [entry],
  nextCursor: 'cur-2',
  hasMore: true,
}

describe('config api · listConfig', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('GETs the config collection URL and returns the list envelope', async () => {
    mock.onGet(CONFIG_URL).reply(200, listPage)
    const res = await listConfig()
    expect(res).toEqual(listPage)
  })

  it('forwards cursor + limit as query params', async () => {
    let seenParams: Record<string, unknown> | undefined
    mock.onGet(CONFIG_URL).reply((config) => {
      seenParams = config.params as Record<string, unknown>
      return [200, listPage]
    })
    await listConfig({ cursor: 'cur-1', limit: 25 })
    expect(seenParams).toEqual({ cursor: 'cur-1', limit: 25 })
  })

  it('sends no query params when called without args', async () => {
    let seenParams: Record<string, unknown> | undefined
    mock.onGet(CONFIG_URL).reply((config) => {
      seenParams = config.params as Record<string, unknown>
      return [200, listPage]
    })
    await listConfig()
    expect(seenParams).toEqual({})
  })

  it('rejects on network failure', async () => {
    mock.onGet(CONFIG_URL).networkError()
    await expect(listConfig()).rejects.toThrow()
  })
})

describe('config api · getConfig', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('GETs the item URL and returns the entry', async () => {
    mock.onGet(`${CONFIG_URL}app.debug`).reply(200, { data: entry })
    const res = await getConfig('app.debug')
    expect(res).toEqual(entry)
  })

  it('percent-encodes slashes in the key', async () => {
    mock.onGet(`${CONFIG_URL}a%2Fb`).reply(200, { data: entry })
    await getConfig('a/b')
    expect(mock.history.get[0]?.url).toBe(`${CONFIG_URL}a%2Fb`)
  })
})

describe('config api · writeConfig', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('POSTs body to the collection URL and resolves void', async () => {
    const body = { key: 'app.name', value: 'gocell', sensitive: false }
    mock.onPost(CONFIG_URL).reply(201, { data: { ...entry, key: 'app.name', value: 'gocell' } })
    await writeConfig(body)
    expect(mock.history.post).toHaveLength(1)
    expect(mock.history.post[0]?.url).toBe(CONFIG_URL)
    expect(JSON.parse(mock.history.post[0]?.data as string)).toEqual(body)
  })

  it('propagates rejection on failure', async () => {
    mock.onPost(CONFIG_URL).networkError()
    await expect(writeConfig({ key: 'x', value: 'y' })).rejects.toThrow()
  })
})

describe('config api · updateConfig', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('PUTs the body to the item URL with CAS version', async () => {
    const url = `${CONFIG_URL}app.debug`
    mock.onPut(url).reply(200, { data: entry })
    await updateConfig('app.debug', { value: 'false', expectedVersion: 1 })
    expect(mock.history.put[0]?.url).toBe(url)
    expect(JSON.parse(mock.history.put[0]?.data as string)).toEqual({
      value: 'false',
      expectedVersion: 1,
    })
  })

  it('percent-encodes key with slashes', async () => {
    mock.onPut(`${CONFIG_URL}a%2Fb`).reply(200, { data: entry })
    await updateConfig('a/b', { value: 'x', expectedVersion: 1 })
    expect(mock.history.put[0]?.url).toBe(`${CONFIG_URL}a%2Fb`)
  })

  it('rejects with 409 ERR_VERSION_CONFLICT on CAS mismatch', async () => {
    mock.onPut(`${CONFIG_URL}app.debug`).reply(409, {
      error: { code: 'ERR_VERSION_CONFLICT', message: 'version conflict' },
    })
    await expect(updateConfig('app.debug', { value: 'x', expectedVersion: 0 })).rejects.toThrow()
  })
})

describe('config api · deleteConfig', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('DELETEs the item URL', async () => {
    mock.onDelete(`${CONFIG_URL}app.debug`).reply(204)
    await deleteConfig('app.debug')
    expect(mock.history.delete[0]?.url).toBe(`${CONFIG_URL}app.debug`)
  })

  it('percent-encodes key with slashes', async () => {
    mock.onDelete(`${CONFIG_URL}a%2Fb`).reply(204)
    await deleteConfig('a/b')
    expect(mock.history.delete[0]?.url).toBe(`${CONFIG_URL}a%2Fb`)
  })
})

describe('config api · publishConfig', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  const publishResponse = {
    data: {
      id: 'snap-1',
      configId: 'cfg-1',
      version: 1,
      value: 'true',
      sensitive: false,
      publishedAt: '2026-05-03T00:00:00Z',
    },
  }

  it('POSTs to the publish sub-resource with NO body', async () => {
    mock.onPost(`${CONFIG_URL}app.debug/publish`).reply(200, publishResponse)
    await publishConfig('app.debug')
    expect(mock.history.post[0]?.url).toBe(`${CONFIG_URL}app.debug/publish`)
    // publish sends no body
    expect(mock.history.post[0]?.data).toBeFalsy()
  })

  it('returns the publish snapshot data', async () => {
    mock.onPost(`${CONFIG_URL}app.debug/publish`).reply(200, publishResponse)
    const result = await publishConfig('app.debug')
    expect(result).toEqual(publishResponse.data)
  })

  it('percent-encodes key with slashes', async () => {
    mock.onPost(`${CONFIG_URL}a%2Fb/publish`).reply(200, publishResponse)
    await publishConfig('a/b')
    expect(mock.history.post[0]?.url).toBe(`${CONFIG_URL}a%2Fb/publish`)
  })
})

describe('config api · rollbackConfig', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('POSTs version + expectedVersion to the rollback sub-resource', async () => {
    mock.onPost(`${CONFIG_URL}app.debug/rollback`).reply(200, { data: entry })
    await rollbackConfig('app.debug', { version: 1, expectedVersion: 2 })
    expect(mock.history.post[0]?.url).toBe(`${CONFIG_URL}app.debug/rollback`)
    expect(JSON.parse(mock.history.post[0]?.data as string)).toEqual({
      version: 1,
      expectedVersion: 2,
    })
  })

  it('rejects with 409 ERR_VERSION_CONFLICT on CAS mismatch', async () => {
    mock.onPost(`${CONFIG_URL}app.debug/rollback`).reply(409, {
      error: { code: 'ERR_VERSION_CONFLICT', message: 'version conflict' },
    })
    await expect(rollbackConfig('app.debug', { version: 1, expectedVersion: 0 })).rejects.toThrow()
  })

  it('percent-encodes key with slashes', async () => {
    mock.onPost(`${CONFIG_URL}a%2Fb/rollback`).reply(200, { data: entry })
    await rollbackConfig('a/b', { version: 1, expectedVersion: 2 })
    expect(mock.history.post[0]?.url).toBe(`${CONFIG_URL}a%2Fb/rollback`)
  })
})
