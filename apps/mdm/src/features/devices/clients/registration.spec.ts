import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { configuration, usage, createRegistrationClient } from './registration'
const tenant = '11111111-1111-4111-8111-111111111111',
  instance = '44444444-4444-4444-8444-444444444444',
  principal = '22222222-2222-4222-8222-222222222222'
const user = { tenantId: tenant, instanceId: instance, principalId: principal }
const snapshot = {
  ...user,
  asOf: 100,
  channels: ['agent', 'windows_mdm', 'macos_mdm'].map((channel) => ({
    channel,
    limit: 20,
    active: 1,
    reserved: 2,
    used: 3,
    overLimit: 0,
    canEnroll: true,
  })),
}
it('rejects foreign users, missing channels and inconsistent usage instead of showing false availability', () => {
  expect(usage(snapshot, tenant, user).channels).toHaveLength(3)
  expect(() => usage(snapshot, instance)).toThrow()
  expect(() => usage(snapshot, tenant, { ...user, principalId: instance })).toThrow()
  expect(() => usage({ ...snapshot, channels: snapshot.channels.slice(1) }, tenant)).toThrow()
  expect(() =>
    usage({ ...snapshot, channels: [...snapshot.channels.slice(1), snapshot.channels[1]] }, tenant),
  ).toThrow()
  expect(() =>
    usage({ ...snapshot, channels: snapshot.channels.map((c) => ({ ...c, used: 0 })) }, tenant),
  ).toThrow()
  expect(
    configuration({ revision: 2, limits: { agent: null, windows_mdm: 0, macos_mdm: 20 } }).limits
      .agent,
  ).toBeNull()
  expect(() =>
    configuration({ revision: 1, limits: { agent: -1, windows_mdm: 20, macos_mdm: 20 } }),
  ).toThrow()
  expect(() =>
    configuration({ revision: 1, limits: { agent: 4294967296, windows_mdm: 20, macos_mdm: 20 } }),
  ).toThrow()
})
it('uses revisioned settings and rejects a receipt that changes the requested responsibility', async () => {
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode(
      o.path.includes('registration-user')
        ? { revision: 1, user: null }
        : { revision: 1, limits: { agent: 0, windows_mdm: null, macos_mdm: null } },
    ),
  )
  const client = createRegistrationClient({ request } as unknown as HttpTransport, tenant)
  await client.change(principal, 0, { agent: 0, windows_mdm: null, macos_mdm: null }, user)
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    method: 'PUT',
    headers: { 'Idempotency-Key': principal },
    body: { expectedRevision: 0 },
  })
  await client.assign('org-device', principal, 0, null)
  await expect(client.assign('org-device', principal, 0, user)).rejects.toThrow(
    'Wrong responsibility',
  )
})
