import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { http } from '@gocell/request'
import { listUserRoles, assignRole, revokeRole, ROLES_URL } from './roles'

describe('roles api · listUserRoles', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('GETs /api/v1/access/roles/{userId} and returns the role array', async () => {
    const roles = [
      {
        id: 'role-1',
        name: 'admin',
        permissions: [{ resource: 'users', action: 'read' }],
      },
    ]
    mock.onGet(`${ROLES_URL}/u-1`).reply(200, { data: roles, nextCursor: '', hasMore: false })
    const result = await listUserRoles('u-1')
    expect(result).toEqual(roles)
  })

  it('percent-encodes the userId in the path', async () => {
    mock.onGet(`${ROLES_URL}/a%2Fb`).reply(200, { data: [], nextCursor: '', hasMore: false })
    await listUserRoles('a/b')
    expect(mock.history.get[0]?.url).toBe(`${ROLES_URL}/a%2Fb`)
  })

  it('rejects on network failure (interceptor maps the error upstream)', async () => {
    mock.onGet(`${ROLES_URL}/u-1`).networkError()
    await expect(listUserRoles('u-1')).rejects.toThrow()
  })
})

describe('roles api · assignRole', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('POSTs to /api/v1/access/roles/assign with the request body', async () => {
    const body = { tenantId: 'tenant-1', userId: 'u-1', roleId: 'role-1' }
    mock.onPost(`${ROLES_URL}/assign`).reply(200, {
      data: { userId: 'u-1', roleId: 'role-1', assigned: true },
    })
    await assignRole(body)
    expect(mock.history.post).toHaveLength(1)
    expect(mock.history.post[0]?.url).toBe(`${ROLES_URL}/assign`)
    expect(JSON.parse(mock.history.post[0]?.data as string)).toEqual(body)
  })

  it('rejects and propagates when http rejects', async () => {
    mock.onPost(`${ROLES_URL}/assign`).networkError()
    await expect(
      assignRole({ tenantId: 'tenant-1', userId: 'u-1', roleId: 'role-1' }),
    ).rejects.toThrow()
  })
})

describe('roles api · revokeRole', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('POSTs to /api/v1/access/roles/revoke with the request body', async () => {
    const body = { tenantId: 'tenant-1', userId: 'u-1', roleId: 'role-1' }
    mock.onPost(`${ROLES_URL}/revoke`).reply(200, {
      data: { userId: 'u-1', roleId: 'role-1', revoked: true },
    })
    await revokeRole(body)
    expect(mock.history.post).toHaveLength(1)
    expect(mock.history.post[0]?.url).toBe(`${ROLES_URL}/revoke`)
    expect(JSON.parse(mock.history.post[0]?.data as string)).toEqual(body)
  })

  it('rejects and propagates when http rejects', async () => {
    mock.onPost(`${ROLES_URL}/revoke`).networkError()
    await expect(
      revokeRole({ tenantId: 'tenant-1', userId: 'u-1', roleId: 'role-1' }),
    ).rejects.toThrow()
  })
})
