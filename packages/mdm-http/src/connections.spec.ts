import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createConnectionsAdapters } from './connections'
const tenant = '11111111-1111-4111-8111-111111111111',
  service = '22222222-2222-4222-8222-222222222222',
  operation = '33333333-3333-4333-8333-333333333333'
function fixture(value: unknown) {
  const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(value))
  return { transport: { request } as unknown as HttpTransport, request }
}
it('preserves saved, active and applied storage versions as separate formal facts', async () => {
  const old = {
      operationId: operation,
      revision: 1,
      profile: 'first',
      state: 'qualified',
      failureReason: null,
      revoked: false,
      qualifiedAt: 100,
      expiresAt: null,
    },
    latest = { ...old, revision: 2, profile: 'candidate' },
    f = fixture({
      revision: 2,
      activeRevision: 1,
      versionCount: 2,
      current: old,
      latest,
      applied: null,
    }),
    result = await createConnectionsAdapters(f.transport, tenant, service).storage.read()
  expect(result.revision).toBe(2)
  expect(result.activeRevision).toBe(1)
  expect(result.latest?.profile).toBe('candidate')
  expect(result.applied).toBeNull()
})
it('does not rename the SMTP selected revision or WNS desired revision into active', async () => {
  const mail = fixture({
      revision: 2,
      selectedRevision: 1,
      versionCount: 2,
      current: null,
      latest: null,
    }),
    wns = fixture({
      revision: 3,
      desiredRevision: 2,
      versionCount: 3,
      current: null,
      latest: null,
      applied: null,
    })
  expect(
    await createConnectionsAdapters(mail.transport, tenant, service).mail.read(),
  ).toHaveProperty('selectedRevision', 1)
  const result = await createConnectionsAdapters(wns.transport, tenant, service).wns.read()
  expect(result).toHaveProperty('desiredRevision', 2)
  expect(result).not.toHaveProperty('activeRevision')
})
it('addresses migration cancellation by the original operation, with no invented body or replay', async () => {
  const value = {
      operationId: operation,
      sourceGeneration: tenant,
      targetGeneration: service,
      expectedStorageRevision: 4,
      targetRevision: 2,
      phase: 'cancelled',
      blockedReason: null,
      sourceObjects: 0,
      verifiedObjects: 0,
      verifiedBytes: 0,
      nextAction: 'none',
      observedAt: null,
    },
    f = fixture(value)
  await createConnectionsAdapters(f.transport, tenant, service).storage.cancelMigration(operation)
  expect(f.request).toHaveBeenCalledTimes(1)
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'POST',
      path: '/api/v1/storage/migrations/operations/{id}/cancel',
      pathParams: { id: operation },
    }),
  )
  expect(f.request.mock.calls[0]?.[0]).not.toHaveProperty('body')
})
it('keeps Apple version pagination on the formal per-purpose endpoint', async () => {
  const f = fixture({ items: [], nextCursor: 'eA' })
  expect(
    (
      await createConnectionsAdapters(f.transport, tenant, service).apple.history('apns', {
        limit: 2,
      })
    ).nextCursor,
  ).toBe('eA')
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      path: '/api/v1/apple/materials/{purpose}/versions',
      pathParams: { purpose: 'apns' },
      query: { limit: 2 },
    }),
  )
})
