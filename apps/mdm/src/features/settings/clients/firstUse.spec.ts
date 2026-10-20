import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { decodeMdmError } from '@rss/api/mdm'
import { createFirstUseClient, decodeFirstUse, decodeIntent } from './firstUse'
const tenant = '11111111-1111-4111-8111-111111111111',
  id = '22222222-2222-4222-8222-222222222222'
const intent = {
  channels: ['windows_mdm'],
  capabilities: { smtp: { kind: 'skip', reason: 'Not needed' } },
  completionRequested: false,
}
it('consumes tenant-bound authoritative progress and rejects unknown wire or invalid choices', () => {
  const value = {
    tenantId: tenant,
    saved: { revision: 1, intent },
    steps: [
      { id: 'windows_mdm', status: 'pending', reason: 'registration_not_allowed', evidence: [] },
      { id: 'smtp', status: 'skipped', reason: 'Not needed', evidence: [] },
    ],
    canComplete: false,
    complete: false,
  }
  expect(decodeFirstUse(value, tenant).steps[0]?.status).toBe('pending')
  expect(() => decodeFirstUse(value, id)).toThrow()
  expect(() =>
    decodeFirstUse({ ...value, steps: [{ ...value.steps[0], status: 'installed' }] }, tenant),
  ).toThrow()
  expect(() => decodeIntent({ ...intent, authenticated: true })).toThrow()
  expect(() => decodeIntent({ ...intent, channels: ['windows_mdm', 'windows_mdm'] })).toThrow()
  expect(() =>
    decodeIntent({ ...intent, capabilities: { agent_package: { kind: 'configure' } } }),
  ).toThrow()
  expect(() =>
    decodeIntent({ ...intent, capabilities: { smtp: { kind: 'skip', reason: '中'.repeat(342) } } }),
  ).toThrow()
})
it('writes CAS intent once and binds receipt queries to the exact original id', async () => {
  let reply = { operationId: id, saved: { revision: 2, intent } }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply)),
    client = createFirstUseClient({ request } as unknown as HttpTransport, tenant)
  await client.update(id, 1, decodeIntent(intent))
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    method: 'PUT',
    path: '/api/v1/settings/first-use',
    headers: { 'Idempotency-Key': id },
    body: { expectedRevision: 1, intent },
  })
  expect((await client.operation(id)).saved.revision).toBe(2)
  reply = { ...reply, operationId: tenant }
  await expect(client.operation(id)).rejects.toThrow('Wrong original')
  expect(decodeMdmError(409, { code: 'first_use_not_ready' }).cause).toBe('wire')
  expect(decodeMdmError(404, { code: 'first_use_operation_not_found' }).cause).toBe('wire')
})
