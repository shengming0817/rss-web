import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { http } from '@gocell/request'
import {
  listFlags,
  getFlag,
  createFlag,
  updateFlag,
  toggleFlag,
  evaluateFlag,
  deleteFlag,
  FLAGS_URL,
} from './flags'

const flag = {
  id: 'flag-1',
  key: 'audit.chain-verify',
  type: 'boolean',
  enabled: true,
  rolloutPercentage: 75,
  description: 'Enable audit chain verification',
  version: 1,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-02T00:00:00Z',
}

const listPage = {
  data: [flag],
  nextCursor: 'cur-2',
  hasMore: true,
}

describe('flags api · listFlags', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('GETs the flags collection URL and returns the list envelope', async () => {
    mock.onGet(FLAGS_URL).reply(200, listPage)
    const res = await listFlags()
    expect(res).toEqual(listPage)
  })

  it('forwards cursor + limit as query params', async () => {
    let seenParams: Record<string, unknown> | undefined
    mock.onGet(FLAGS_URL).reply((config) => {
      seenParams = config.params as Record<string, unknown>
      return [200, listPage]
    })
    await listFlags({ cursor: 'cur-1', limit: 25 })
    expect(seenParams).toEqual({ cursor: 'cur-1', limit: 25 })
  })

  it('sends no query params when called without args', async () => {
    let seenParams: Record<string, unknown> | undefined
    mock.onGet(FLAGS_URL).reply((config) => {
      seenParams = config.params as Record<string, unknown>
      return [200, listPage]
    })
    await listFlags()
    expect(seenParams).toEqual({})
  })

  it('rejects on network failure', async () => {
    mock.onGet(FLAGS_URL).networkError()
    await expect(listFlags()).rejects.toThrow()
  })
})

describe('flags api · getFlag', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('GETs the item URL and returns the flag', async () => {
    mock.onGet(`${FLAGS_URL}audit.chain-verify`).reply(200, { data: flag })
    const res = await getFlag('audit.chain-verify')
    expect(res).toEqual(flag)
  })

  it('percent-encodes slashes in the key', async () => {
    mock.onGet(`${FLAGS_URL}a%2Fb`).reply(200, { data: flag })
    await getFlag('a/b')
    expect(mock.history.get[0]?.url).toBe(`${FLAGS_URL}a%2Fb`)
  })
})

describe('flags api · createFlag', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('POSTs body to the collection URL and resolves void', async () => {
    const body = { key: 'audit.chain-verify', enabled: false, description: 'test' }
    mock.onPost(FLAGS_URL).reply(201, { data: flag })
    await createFlag(body)
    expect(mock.history.post).toHaveLength(1)
    expect(mock.history.post[0]?.url).toBe(FLAGS_URL)
    expect(JSON.parse(mock.history.post[0]?.data as string)).toEqual(body)
  })

  it('propagates rejection on failure', async () => {
    mock.onPost(FLAGS_URL).networkError()
    await expect(createFlag({ key: 'x' })).rejects.toThrow()
  })
})

describe('flags api · updateFlag', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('PUTs the body to the item URL with CAS version', async () => {
    const url = `${FLAGS_URL}audit.chain-verify`
    mock.onPut(url).reply(200, { data: flag })
    await updateFlag('audit.chain-verify', {
      enabled: true,
      rolloutPercentage: 50,
      description: 'updated',
      expectedVersion: 1,
    })
    expect(mock.history.put[0]?.url).toBe(url)
    expect(JSON.parse(mock.history.put[0]?.data as string)).toEqual({
      enabled: true,
      rolloutPercentage: 50,
      description: 'updated',
      expectedVersion: 1,
    })
  })

  it('percent-encodes key with slashes', async () => {
    mock.onPut(`${FLAGS_URL}a%2Fb`).reply(200, { data: flag })
    await updateFlag('a/b', {
      enabled: true,
      rolloutPercentage: 100,
      description: 'd',
      expectedVersion: 1,
    })
    expect(mock.history.put[0]?.url).toBe(`${FLAGS_URL}a%2Fb`)
  })

  it('rejects with 409 ERR_VERSION_CONFLICT on CAS mismatch', async () => {
    mock.onPut(`${FLAGS_URL}audit.chain-verify`).reply(409, {
      error: { code: 'ERR_VERSION_CONFLICT', message: 'version conflict' },
    })
    await expect(
      updateFlag('audit.chain-verify', {
        enabled: true,
        rolloutPercentage: 100,
        description: 'd',
        expectedVersion: 0,
      }),
    ).rejects.toThrow()
  })
})

describe('flags api · toggleFlag', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('POSTs enabled + expectedVersion to the toggle sub-resource', async () => {
    mock.onPost(`${FLAGS_URL}audit.chain-verify/toggle`).reply(200, { data: flag })
    await toggleFlag('audit.chain-verify', { enabled: false, expectedVersion: 1 })
    expect(mock.history.post[0]?.url).toBe(`${FLAGS_URL}audit.chain-verify/toggle`)
    expect(JSON.parse(mock.history.post[0]?.data as string)).toEqual({
      enabled: false,
      expectedVersion: 1,
    })
  })

  it('percent-encodes key with slashes', async () => {
    mock.onPost(`${FLAGS_URL}a%2Fb/toggle`).reply(200, { data: flag })
    await toggleFlag('a/b', { enabled: true, expectedVersion: 1 })
    expect(mock.history.post[0]?.url).toBe(`${FLAGS_URL}a%2Fb/toggle`)
  })

  it('rejects with 409 ERR_VERSION_CONFLICT on CAS mismatch', async () => {
    mock.onPost(`${FLAGS_URL}audit.chain-verify/toggle`).reply(409, {
      error: { code: 'ERR_VERSION_CONFLICT', message: 'version conflict' },
    })
    await expect(
      toggleFlag('audit.chain-verify', { enabled: false, expectedVersion: 0 }),
    ).rejects.toThrow()
  })
})

describe('flags api · evaluateFlag', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('POSTs subject to the evaluate sub-resource and returns bool result', async () => {
    const evalResponse = { data: { key: 'audit.chain-verify', enabled: true } }
    mock.onPost(`${FLAGS_URL}audit.chain-verify/evaluate`).reply(200, evalResponse)
    const res = await evaluateFlag('audit.chain-verify', { subject: 'user-123' })
    expect(mock.history.post[0]?.url).toBe(`${FLAGS_URL}audit.chain-verify/evaluate`)
    expect(JSON.parse(mock.history.post[0]?.data as string)).toEqual({ subject: 'user-123' })
    expect(res).toEqual(evalResponse.data)
  })

  it('percent-encodes key with slashes', async () => {
    mock.onPost(`${FLAGS_URL}a%2Fb/evaluate`).reply(200, { data: { key: 'a/b', enabled: false } })
    await evaluateFlag('a/b', { subject: 'u' })
    expect(mock.history.post[0]?.url).toBe(`${FLAGS_URL}a%2Fb/evaluate`)
  })

  it('rejects on network failure', async () => {
    mock.onPost(`${FLAGS_URL}audit.chain-verify/evaluate`).networkError()
    await expect(evaluateFlag('audit.chain-verify', { subject: 'u' })).rejects.toThrow()
  })
})

describe('flags api · deleteFlag', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('DELETEs the item URL', async () => {
    mock.onDelete(`${FLAGS_URL}audit.chain-verify`).reply(204)
    await deleteFlag('audit.chain-verify')
    expect(mock.history.delete[0]?.url).toBe(`${FLAGS_URL}audit.chain-verify`)
  })

  it('percent-encodes key with slashes', async () => {
    mock.onDelete(`${FLAGS_URL}a%2Fb`).reply(204)
    await deleteFlag('a/b')
    expect(mock.history.delete[0]?.url).toBe(`${FLAGS_URL}a%2Fb`)
  })

  it('rejects on network failure', async () => {
    mock.onDelete(`${FLAGS_URL}audit.chain-verify`).networkError()
    await expect(deleteFlag('audit.chain-verify')).rejects.toThrow()
  })
})
