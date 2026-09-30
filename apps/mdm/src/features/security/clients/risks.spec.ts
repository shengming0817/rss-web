import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { operation } from '../../../services/useOperation'
import { createRisksClient } from './risks'
import { createSecurityActionsClient } from './actions'
import { riskAssessment } from './risks-model'
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222',
  source = { registrationId: other, generation: 1, source: 'agent.builtin' },
  assessment = {
    id: other,
    version: 2,
    risk: id,
    riskRevision: 1,
    device: 'device-01',
    provider: 'Synthetic provider',
    evaluatedAt: 102,
    state: 'clear',
    reason: 'fixed_version_observed',
    software: { id: 'browser', version: '129.0' },
    patch: { state: 'available', targetVersion: '129.0' },
    evidence: { id: other, observedAt: 101, source },
  },
  envelope = { contract: 'security-v1', tenantId: id, source: 'mock', asOf: 103 }
it('requires evidence for a clear risk and binds reassessment receipt to the exact risk, device and version', async () => {
  expect(() => riskAssessment({ ...assessment, evidence: null })).toThrow()
  expect(() => riskAssessment({ ...assessment, reason: 'inventory_missing' })).toThrow()
  expect(() =>
    riskAssessment({ ...assessment, evidence: { ...assessment.evidence, observedAt: 104 } }),
  ).toThrow()
  const body = operation({}, 1)
  let reply: unknown = { ...envelope, assessment, operation: body.operationId }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply)),
    transport = { request } as unknown as HttpTransport,
    client = createRisksClient(transport, id, true)
  await expect(client.reassess(id, 'device-01', body)).resolves.toMatchObject({
    assessment: { state: 'clear' },
  })
  expect(request.mock.lastCall![0]).toMatchObject({ pathParams: { id, device: 'device-01' }, body })
  reply = {
    ...envelope,
    assessment: { ...assessment, device: 'device-02' },
    operation: body.operationId,
  }
  await expect(client.reassess(id, 'device-01', body)).rejects.toThrow()
  reply = { ...envelope, assessment, operation: other }
  await expect(client.reassess(id, 'device-01', body)).rejects.toThrow()
  reply = { ...envelope, assessment }
  await expect(createRisksClient(transport, id, false).current(id, 'device-01')).rejects.toThrow()
  await expect(createRisksClient(transport, other, true).current(id, 'device-01')).rejects.toThrow()
})
it('binds dispatch receipts to their request and rejects a device effect preceding the device result', async () => {
  const body = operation({}, 2),
    summary = {
      id: body.operationId,
      batch: null,
      device: 'device-01',
      origin: { kind: 'security', request: other },
      admission: 'accepted',
      dispatch: 'queued',
      receipt: 'not_received',
      execution: 'not_started',
      effect: 'unverified',
      compliance: 'unknown',
      attempt: body.operationId,
      nativeCode: null,
      waitingReason: 'device_receipt',
    },
    action = {
      id: body.operationId,
      revision: 1,
      operation: body.operationId,
      request: other,
      target: {
        kind: 'risk_remediation',
        risk: id,
        assessment: other,
        assessmentVersion: 1,
        device: 'device-01',
      },
      source,
      createdAt: 100,
      deadline: 200,
      resultAt: null,
      detectedAt: null,
      summary,
    }
  let reply: unknown = { ...envelope, action }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply)),
    transport = { request } as unknown as HttpTransport,
    client = createSecurityActionsClient(transport, id, true)
  await expect(client.dispatch(other, body)).resolves.toMatchObject({
    action: { id: body.operationId },
  })
  reply = { ...envelope, action: { ...action, request: id } }
  await expect(client.dispatch(other, body)).rejects.toThrow()
  reply = {
    ...envelope,
    action: {
      ...action,
      resultAt: 102,
      detectedAt: 101,
      summary: { ...summary, effect: 'verified_present' },
    },
  }
  await expect(client.read(body.operationId)).rejects.toThrow()
})
