import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { http } from '@gocell/request'
import {
  listUsers,
  createUser,
  patchUser,
  deleteUser,
  lockUser,
  unlockUser,
  changeUserPassword,
  USERS_URL,
} from './identities'

const page = {
  data: [
    {
      id: 'u-1',
      username: 'alice',
      email: 'alice@corp.example',
      status: 'active',
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-02T00:00:00Z',
    },
  ],
  nextCursor: 'cur-2',
  hasMore: true,
}

describe('identities api · listUsers', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('GETs the users collection URL and returns the list envelope', async () => {
    mock.onGet(USERS_URL).reply(200, page)
    const res = await listUsers()
    expect(res).toEqual(page)
  })

  it('forwards cursor + limit as query params', async () => {
    let seenParams: Record<string, unknown> | undefined
    mock.onGet(USERS_URL).reply((config) => {
      seenParams = config.params as Record<string, unknown>
      return [200, page]
    })
    await listUsers({ cursor: 'cur-1', limit: 25 })
    expect(seenParams).toEqual({ cursor: 'cur-1', limit: 25 })
  })

  it('sends no query params when called without args', async () => {
    let seenParams: Record<string, unknown> | undefined
    mock.onGet(USERS_URL).reply((config) => {
      seenParams = config.params as Record<string, unknown>
      return [200, page]
    })
    await listUsers()
    expect(seenParams).toEqual({})
  })

  it('rejects on network failure (interceptor maps the error upstream)', async () => {
    mock.onGet(USERS_URL).networkError()
    await expect(listUsers()).rejects.toThrow()
  })
})

describe('identities api · mutations', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('createUser POSTs the body to the users collection', async () => {
    const body = { username: 'bob', email: 'bob@corp.example', password: 'Secret!23' }
    mock.onPost(USERS_URL).reply(201, { data: { id: 'u-2', ...body } })
    await createUser(body)
    expect(mock.history.post).toHaveLength(1)
    expect(mock.history.post[0]?.url).toBe(USERS_URL)
    expect(JSON.parse(mock.history.post[0]?.data as string)).toEqual(body)
  })

  it('patchUser PATCHes the item endpoint with the partial body', async () => {
    mock.onPatch(`${USERS_URL}/u-1`).reply(200, { data: {} })
    await patchUser('u-1', { email: 'new@corp.example' })
    expect(mock.history.patch[0]?.url).toBe(`${USERS_URL}/u-1`)
    expect(JSON.parse(mock.history.patch[0]?.data as string)).toEqual({ email: 'new@corp.example' })
  })

  it('deleteUser DELETEs the item endpoint', async () => {
    mock.onDelete(`${USERS_URL}/u-1`).reply(204)
    await deleteUser('u-1')
    expect(mock.history.delete[0]?.url).toBe(`${USERS_URL}/u-1`)
  })

  it('lockUser POSTs the lock sub-resource', async () => {
    mock.onPost(`${USERS_URL}/u-1/lock`).reply(200, { data: { status: 'locked' } })
    await lockUser('u-1')
    expect(mock.history.post[0]?.url).toBe(`${USERS_URL}/u-1/lock`)
  })

  it('unlockUser POSTs the unlock sub-resource', async () => {
    mock.onPost(`${USERS_URL}/u-1/unlock`).reply(200)
    await unlockUser('u-1')
    expect(mock.history.post[0]?.url).toBe(`${USERS_URL}/u-1/unlock`)
  })

  it('changeUserPassword POSTs old+new to the password sub-resource', async () => {
    const body = { oldPassword: 'old', newPassword: 'New!2345' }
    mock.onPost(`${USERS_URL}/u-1/password`).reply(200, { data: {} })
    await changeUserPassword('u-1', body)
    expect(mock.history.post[0]?.url).toBe(`${USERS_URL}/u-1/password`)
    expect(JSON.parse(mock.history.post[0]?.data as string)).toEqual(body)
  })

  it('percent-encodes the id in the item URL', async () => {
    mock.onDelete(`${USERS_URL}/a%2Fb`).reply(204)
    await deleteUser('a/b')
    expect(mock.history.delete[0]?.url).toBe(`${USERS_URL}/a%2Fb`)
  })

  it('propagates the rejection on a failed mutation', async () => {
    mock.onPost(USERS_URL).networkError()
    await expect(
      createUser({ username: 'x', email: 'x@y.z', password: 'Secret!23' }),
    ).rejects.toThrow()
  })
})
