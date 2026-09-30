import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { operation } from '../../../services/useOperation'
import { createOperationsClients } from '../client'
import { alert, auditEntry } from './model'
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222'
const target = { kind: 'compliance_rule', id, revision: 1, device: 'device-01' }
const auditValue = {
  id,
  at: 100,
  actor: other,
  action: 'compliance_saved',
  target,
  operation: id,
  outcome: 'accepted',
  stream: 'mdm_business',
  stage: 'business',
  status: null,
}
const value = {
  id,
  revision: 1,
  code: 'compliance_noncompliant',
  severity: 'high',
  target,
  state: 'open',
  openedAt: 100,
  updatedAt: 100,
  resolvedAt: null,
  evidence: { id: other, version: 1, at: 99, state: 'active' },
  acknowledgment: null,
  operation: null,
}
it('rejects contradictory resolution and raw sensitive audit metadata', () => {
  expect(alert(value).state).toBe('open')
  expect(() => alert({ ...value, target: { ...target, kind: 'security_request' } })).toThrow()
  expect(() => alert({ ...value, target: { ...target, device: null } })).toThrow()
  expect(() => alert({ ...value, state: 'resolved' })).toThrow()
  expect(() => alert({ ...value, state: 'resolved', resolvedAt: 101 })).toThrow()
  expect(() => alert({ ...value, acknowledgment: { actor: other, at: 100 } })).toThrow()
  expect(auditEntry(auditValue)).toMatchObject({ id })
  expect(() => auditEntry({ ...auditValue, body: { password: 'synthetic secret' } })).toThrow()
})
it('binds candidate tenant, source and acknowledgment receipt to the exact request', async () => {
  const body = operation({}, 1),
    confirmed = {
      ...value,
      revision: 2,
      acknowledgment: { actor: other, at: 100 },
      operation: body.operationId,
    }
  let reply: unknown = { contract: 'operations-v1', tenantId: id, source: 'mock', alert: confirmed }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply)),
    transport = { request } as unknown as HttpTransport
  const client = createOperationsClients(transport, id, true)
  expect(await client.alerts.acknowledge(id, body)).toEqual(confirmed)
  expect(request.mock.lastCall![0]).toMatchObject({
    method: 'POST',
    path: '/api/mdm-candidate/v1/operations/alerts/{id}/acknowledge',
    pathParams: { id },
    body,
  })
  await expect(createOperationsClients(transport, id, false).alerts.read(id)).rejects.toThrow()
  await expect(createOperationsClients(transport, other, true).alerts.read(id)).rejects.toThrow()
  reply = {
    contract: 'operations-v1',
    tenantId: id,
    source: 'mock',
    alert: { ...confirmed, operation: other },
  }
  await expect(client.alerts.acknowledge(id, body)).rejects.toThrow()
  reply = {
    contract: 'operations-v1',
    tenantId: id,
    source: 'mock',
    entry: { ...auditValue, id: other },
  }
  reply = { ...(reply as object), entry: auditValue }
  expect(await client.audit.read(id)).toEqual(auditValue)
  reply = { ...(reply as object), entry: { ...auditValue, id: other } }
  await expect(client.audit.read(id)).rejects.toThrow('Wrong audit')
})
