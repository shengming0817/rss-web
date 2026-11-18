import { expect, it, vi } from 'vitest'
import type { SessionOwner } from '@rss/auth-core'
import type { HttpTransport } from '@rss/api/mdm'
import { bindSession } from './index'
const tenant = '11111111-1111-4111-8111-111111111111'
const managementTenant = '22222222-2222-4222-8222-222222222222'
const principalId = '44444444-4444-4444-8444-444444444444'
const sessionId = '55555555-5555-4555-8555-555555555555'
it('takes current CSRF from the sole owner, rejects a foreign tenant and never replays a write', async () => {
  const request = vi.fn(async () => {
    throw new Error('Unknown commit result')
  })
  const transport = { request } as unknown as HttpTransport
  const owner = {
    getSnapshot: () => ({ identity: { principalId }, session: { id: sessionId } }),
    business: async (work: (credential: { tenant: string; csrf: string }) => Promise<unknown>) =>
      work({ tenant, csrf: 'rotated-current-token' }),
  } as SessionOwner
  const bound = bindSession(transport, owner, {
    realm: 'tenant',
    credentialTenant: tenant,
    principalId,
    sessionId,
  })
  await expect(
    bound.request({
      method: 'POST',
      path: '/api/v1/action',
      pathParams: { tenant },
      successStatus: 204,
    }),
  ).rejects.toThrow('Unknown')
  expect(request).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      headers: { 'X-Identity-Request': '1', 'X-CSRF-Token': 'rotated-current-token' },
    }),
  )
  await expect(
    bound.request({
      method: 'POST',
      path: '/api/v1/action',
      pathParams: { tenant: managementTenant },
      successStatus: 204,
    }),
  ).rejects.toThrow('Mismatched')
  expect(request).toHaveBeenCalledTimes(1)
})

it('separates the management credential realm from a tenant registry resource locator', async () => {
  const request = vi.fn(async () => undefined)
  const transport = { request } as unknown as HttpTransport
  const owner = {
    getSnapshot: () => ({ identity: { principalId }, session: { id: sessionId } }),
    business: async (work: (credential: { tenant: string; csrf: string }) => Promise<unknown>) =>
      work({ tenant: managementTenant, csrf: 'current' }),
  } as SessionOwner
  const bound = bindSession(transport, owner, {
    realm: 'management',
    credentialTenant: managementTenant,
    principalId,
    sessionId,
  })
  await bound.request({
    method: 'DELETE',
    path: '/api/v1/tenant-administration/tenants/{tenant}',
    pathParams: { tenant },
    body: { expectedRevision: 3 },
    successStatus: 204,
  })
  expect(request).toHaveBeenCalledTimes(1)
  await expect(
    bound.request({
      method: 'POST',
      path: '/api/v1/identity/tenants/{tenant}/accounts',
      pathParams: { tenant },
      successStatus: 204,
    }),
  ).rejects.toThrow('Mismatched')
  const foreignOwner = bindSession(transport, owner, {
    realm: 'tenant',
    credentialTenant: tenant,
    principalId,
    sessionId,
  })
  await expect(
    foreignOwner.request({
      method: 'GET',
      path: '/api/v1/tenants/{tenant}/authorization',
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toThrow('Mismatched')
  expect(request).toHaveBeenCalledTimes(1)
})
