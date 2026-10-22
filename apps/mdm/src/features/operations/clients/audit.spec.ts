import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createAuditClient, auditQuery, timelinePage } from './audit'
import { createDirectoryClient } from '../../devices/clients/directory'
const id = '11111111-1111-4111-8111-111111111111'
const fact = {
  source: 'mdm.business',
  eventId: 'event-1',
  position: 17,
  recordedAt: 1760000000,
  observedAt: 1760000001,
  actorKind: 'user',
  actor: 'operator',
  action: 'command_cancel',
  target: { type: 'device', id: 'device-01' },
  deviceId: 'device-01',
  operationId: id,
  relatedOperationIds: [id],
  requestId: null,
  registrationId: null,
  registrationRequestId: null,
  instanceId: null,
  auditOutcome: 'succeeded',
  phase: 'request',
  executionState: null,
  effect: 'unverified',
  requestWriteOutcome: null,
  supported: true,
}
it('uses the same safe projection and exact formal query names for audit and device timelines', async () => {
  const page = {
    items: [fact],
    nextCursor: 'opaque',
    coverage: { indexedThrough: 17, sourceThrough: 20, complete: false },
  }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(page))
  const transport = { request } as unknown as HttpTransport
  const query = {
    actor: 'operator',
    action: 'command_cancel',
    targetType: 'device',
    targetId: 'device-01',
    operationId: id,
    outcome: 'succeeded' as const,
    from: 1760000000,
    until: 1760000002,
    cursor: 'opaque',
    limit: 1,
  }
  expect(await createAuditClient(transport).list({ ...query, device: 'device-01' })).toEqual(page)
  expect(request.mock.lastCall![0]).toMatchObject({
    method: 'GET',
    path: '/api/v1/audit-events',
    query: { ...query, device: 'device-01' },
  })
  expect(await createDirectoryClient(transport).history('device-01', query)).toEqual(page)
  expect(request.mock.lastCall![0]).toMatchObject({
    method: 'GET',
    path: '/api/v1/devices/{id}/timeline',
    pathParams: { id: 'device-01' },
    query,
  })
  expect(() =>
    createDirectoryClient(transport).history('device-01', { device: 'other' } as never),
  ).toThrow()
  expect(request).toHaveBeenCalledTimes(2)
})
it('rejects sensitive fields, retired envelopes and malformed filter bindings', () => {
  const page = {
    items: [fact],
    nextCursor: null,
    coverage: { indexedThrough: null, sourceThrough: null, complete: false },
  }
  expect(timelinePage(page).items[0]?.recordedAt).toBe(1760000000)
  expect(() =>
    timelinePage({ ...page, items: [{ ...fact, body: { password: 'secret' } }] }),
  ).toThrow()
  expect(() => timelinePage({ contract: 'operations-v1', ...page })).toThrow()
  for (const query of [
    { operation: id },
    { stream: 'mdm_business' },
    { outcome: 'accepted' },
    { from: 10, until: 10 },
    { from: -1 },
    { limit: 201 },
    { operationId: 'not-uuid' },
  ])
    expect(() => auditQuery(query as never)).toThrow()
})
