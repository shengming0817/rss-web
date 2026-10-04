import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { baselineDevice } from './governance-model'
import { createGovernanceClient } from './governance'
import { createSecurityRequestsClient } from './requests'
import { operation } from '../../../services/useOperation'
const id = '11111111-1111-4111-8111-111111111111'
it('rejects governance that asserts grace or exemption over unknown or drifted native evidence', () => {
  const row = {
      ruleId: id,
      ruleVersion: 1,
      nativeStatus: 'unknown',
      drift: 'pending_assessment',
      governance: 'unknown',
      request: null,
    },
    value = {
      device: 'device-01',
      native: { device: 'device-01', status: 'unknown', reason: 'no_rules', rules: [] },
      rules: [row],
    }
  expect(baselineDevice(value)).toEqual(value)
  expect(() => baselineDevice({ ...value, rules: [{ ...row, governance: 'grace' }] })).toThrow()
  expect(() =>
    baselineDevice({ ...value, rules: [{ ...row, governance: 'exempt', request: id }] }),
  ).toThrow()
  expect(() =>
    baselineDevice({
      ...value,
      rules: [{ ...row, nativeStatus: 'non_compliant', drift: 'none', governance: 'grace' }],
    }),
  ).toThrow()
  expect(() => baselineDevice({ ...value, rules: [{ ...row, drift: 'none' }] })).toThrow()
})
it('binds baseline writes and projections to tenant, source, identity and revision', async () => {
  const other = '22222222-2222-4222-8222-222222222222',
    definition = {
      name: 'Baseline',
      enabled: true,
      scope: other,
      rules: [{ id: other, revision: 1 }],
      graceUntil: null,
    },
    body = operation(definition, 2),
    baseline = {
      id,
      revision: 3,
      operation: body.operationId,
      createdAt: 100,
      scopeRevision: 1,
      definition,
    },
    envelope = { contract: 'security-v1', tenantId: id, source: 'mock', asOf: 100 }
  let reply: unknown = { ...envelope, baseline }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply)),
    transport = { request } as unknown as HttpTransport,
    client = createGovernanceClient(transport, id, true)
  expect(await client.put(id, body)).toEqual({ baseline, asOf: 100 })
  expect(request.mock.lastCall![0]).toMatchObject({
    method: 'PUT',
    path: '/api/v1/mdm-candidate/security/baselines/{id}',
    pathParams: { id },
    body,
  })
  await expect(createGovernanceClient(transport, other, true).read(id)).rejects.toThrow()
  await expect(createGovernanceClient(transport, id, false).read(id)).rejects.toThrow()
  reply = { ...envelope, baseline: { ...baseline, operation: other } }
  await expect(client.put(id, body)).rejects.toThrow()
  reply = { ...envelope, baseline: { ...baseline, revision: 4 } }
  await expect(client.put(id, body)).rejects.toThrow()
  reply = { ...envelope, baseline: id, revision: 2, items: [], snapshot: other, nextCursor: null }
  await expect(client.devices(id, 3)).rejects.toThrow()
  reply = { ...envelope, baseline: id, revision: 3, items: [], snapshot: other, nextCursor: null }
  await expect(client.devices(id, 3, 'opaque')).resolves.toMatchObject({ revision: 3 })
  expect(request.mock.lastCall![0].query).toEqual({ revision: 3, limit: 20, cursor: 'opaque' })
})
it('rejects mismatched approval targets, self decisions and receipts from a different action', async () => {
  const other = '22222222-2222-4222-8222-222222222222',
    target = {
      kind: 'compliance_exception' as const,
      baseline: id,
      baselineRevision: 1,
      rule: other,
      ruleVersion: 1,
      device: 'device-01',
    },
    body = operation({ target, reason: 'Temporary exception', validFrom: 100, validUntil: 200 }),
    value = {
      ...body.input,
      id: body.operationId,
      revision: 1,
      operation: body.operationId,
      requester: id,
      createdAt: 100,
      state: 'pending',
      decision: null,
      revocation: null,
      consumption: null,
    },
    envelope = { contract: 'security-v1', tenantId: id, source: 'mock', asOf: 100 }
  let reply: unknown = { ...envelope, request: value }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply)),
    transport = { request } as unknown as HttpTransport,
    client = createSecurityRequestsClient(transport, id, true)
  expect((await client.create(body)).request.id).toBe(body.operationId)
  reply = { ...envelope, request: { ...value, target: { ...target, device: 'device-02' } } }
  await expect(client.create(body)).rejects.toThrow()
  const decision = operation({}, 1),
    approved = {
      ...value,
      revision: 2,
      operation: decision.operationId,
      state: 'approved',
      decision: { by: other, at: 101, value: 'approved' },
    }
  reply = { ...envelope, request: approved }
  await expect(client.decide(value.id, 'approve', decision)).resolves.toMatchObject({
    request: { state: 'approved' },
  })
  await expect(client.decide(value.id, 'deny', decision)).rejects.toThrow()
  reply = { ...envelope, request: { ...approved, decision: { ...approved.decision, by: id } } }
  await expect(client.read(value.id)).rejects.toThrow()
})
