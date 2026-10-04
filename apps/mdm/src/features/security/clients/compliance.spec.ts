import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { operation } from '../../../services/useOperation'
import { createComplianceClient } from './compliance'
import {
  complianceAssessment,
  complianceDefinition,
  complianceTask,
  currentCompliance,
} from './compliance-model'
const id = '11111111-1111-4111-8111-111111111111',
  task = '22222222-2222-4222-8222-222222222222'
const definition = complianceDefinition({
  name: 'Baseline',
  severity: 'high',
  enabled: true,
  platform: 'all',
  target: { kind: 'all' },
  criteria: { kind: 'and', children: [] },
})
const assessment = {
  ruleId: id,
  ruleVersion: 1,
  dictionaryVersion: 'assets-v1',
  factWatermark: 4,
  evaluatedAt: 1780000000,
  groups: [],
  status: 'unknown',
  reason: 'facts_unknown',
  condition: 'unknown',
  applicability: { platform: 'all', platformDecision: 'match', sources: [], groups: [] },
  explanations: [{ path: [0], outcome: 'missing' }],
  evidence: [],
}
it('keeps native pagination, versions, CAS receipts and explicit history filters on their exact routes', async () => {
  let reply: unknown = { items: [], nextCursor: id }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply))
  const client = createComplianceClient({ request } as unknown as HttpTransport)
  await client.list(id)
  expect(request.mock.lastCall![0]).toMatchObject({
    path: '/api/v1/compliance-rules',
    query: { after: id },
  })
  reply = { id, revision: 2, definition }
  expect(await client.version(id, 2)).toEqual(reply)
  expect(request.mock.lastCall![0]).toMatchObject({ pathParams: { id, revision: '2' } })
  await expect(client.version(id, 1)).rejects.toThrow()
  reply = { id, revision: 2, task }
  const body = operation(definition, 1)
  await client.put(id, body)
  expect(request.mock.lastCall![0]).toMatchObject({ method: 'PUT', body, successStatus: 200 })
  reply = { id, revision: 3, task }
  await expect(client.put(id, body)).rejects.toThrow()
  reply = { id, revision: 2, task: null }
  await expect(client.put(id, body)).rejects.toThrow()
  reply = { items: [{ ...assessment, task, disposition: 'published' }], nextCursor: 'opaque-token' }
  await client.history('device-01', { cursor: 'previous-token', from: 100, until: 200, limit: 10 })
  expect(request.mock.lastCall![0]).toMatchObject({
    path: '/api/v1/devices/{device}/compliance/history',
    pathParams: { device: 'device-01' },
    query: { cursor: 'previous-token', from: 100, until: 200, limit: 10 },
  })
})
it('retains explicit unknown, pending previous evidence and more than two platform sources without deriving compliance', () => {
  const sources = ['mdm.apple', 'agent', 'manual'].map((source) => ({
    source,
    registration: task,
    generation: '3',
    epoch: id,
  }))
  expect(
    complianceAssessment({ ...assessment, applicability: { ...assessment.applicability, sources } })
      .status,
  ).toBe('unknown')
  const value = {
    device: 'device-01',
    status: 'pending',
    reason: null,
    rules: [{ ruleId: id, ruleVersion: 2, status: 'pending', current: null, previous: assessment }],
  }
  expect(currentCompliance(value, 'device-01')).toEqual(value)
  expect(() => currentCompliance(value, 'device-02')).toThrow()
  expect(() =>
    currentCompliance(
      { ...value, rules: [{ ...value.rules[0], current: assessment }] },
      'device-01',
    ),
  ).toThrow()
  expect(() => complianceDefinition({ ...definition, criteria: null })).toThrow()
  expect(() =>
    complianceAssessment({
      ...assessment,
      evidence: [{ field: 'password', sources: [], value: 'secret' }],
    }),
  ).toThrow()
  expect(() =>
    currentCompliance(
      { device: 'device-01', status: 'compliant', reason: 'no_rules', rules: [] },
      'device-01',
    ),
  ).toThrow()
})
it('rejects task phases that contradict native completion and failure facts', () => {
  const value = {
    task,
    ruleId: id,
    ruleVersion: 1,
    factWatermark: 4,
    phase: 'superseded',
    processed: 0,
    completed: true,
    failure: 'superseded',
    diagnostic: { reason: 'group_input_pending' },
  }
  expect(complianceTask(value, id, task)).toEqual(value)
  expect(() => complianceTask({ ...value, phase: 'evaluating' }, id, task)).toThrow()
  expect(() => complianceTask({ ...value, failure: null }, id, task)).toThrow()
  expect(() => complianceTask({ ...value, ruleId: task }, id, task)).toThrow()
})
