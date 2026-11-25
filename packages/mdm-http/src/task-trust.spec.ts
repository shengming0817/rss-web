import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createTaskTrustAdapter } from './task-trust'
const id = '11111111-1111-4111-8111-111111111111',
  registrationId = '22222222-2222-4222-8222-222222222222'
function fixture(reply: unknown) {
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply))
  return {
    request,
    adapter: createTaskTrustAdapter({ request } as unknown as HttpTransport, id, registrationId),
  }
}
it('binds trust to the current tenant and service and carries the original idempotency key', async () => {
  const trust = { version: 1, service_id: registrationId, tenant: id, revision: 1, keys: [] }
  const f = fixture(trust)
  await f.adapter.changeTrust(id, { action: 'prepare', expectedRevision: 0 })
  expect(f.request.mock.calls[0]![0].headers).toMatchObject({ 'Idempotency-Key': id })
  await expect(fixture({ ...trust, tenant: registrationId }).adapter.trust()).rejects.toThrow(
    'Wrong task signing',
  )
  await expect(fixture({ ...trust, version: 2 }).adapter.trust()).rejects.toThrow(
    'Wrong task signing',
  )
  expect(
    await fixture(null).adapter.trustObservation('7f408d60-f79e-504d-8fdc-35d425b1946a'),
  ).toBeNull()
})
