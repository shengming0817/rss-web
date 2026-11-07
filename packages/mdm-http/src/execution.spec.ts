import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createExecutionAdapter } from './execution'
const id = '11111111-1111-4111-8111-111111111111',
  registrationId = '22222222-2222-4222-8222-222222222222'
const row = {
  evidence: null,
  id,
  kind: 'command',
  device: 'pc',
  registrationId,
  generation: 2,
  origin: 'direct',
  policy: null,
  deadline: 100,
  status: 'applied',
}
function fixture(reply: unknown) {
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply))
  return {
    request,
    adapter: createExecutionAdapter({ request } as unknown as HttpTransport, id, registrationId),
  }
}
it('requests the complete identity projection and rejects omitted identities and duplicate rows', async () => {
  const f = fixture({ items: [row], nextCursor: 'YQ' })
  expect((await f.adapter.list({ filter: "device=='pc'" })).nextCursor).toBe('YQ')
  expect(f.request.mock.calls[0]![0].query?.['fields']).toContain('registrationId')
  await expect(fixture({ items: [{ id }], nextCursor: null }).adapter.list({})).rejects.toThrow()
  await expect(fixture({ items: [row, row], nextCursor: null }).adapter.list({})).rejects.toThrow(
    'Duplicate',
  )
})
it('preserves native effect waiting even when the command is applied and rejects another operation', async () => {
  const detail = {
    operationId: id,
    owner: 'device',
    commandId: id,
    revision: 1,
    task: { platform: 'windows', kind: 'sync_ml', name: 'sync', objects: [] },
    target: { kind: 'device' },
    inputVersion: 'v1',
    deadline: 100,
    dispatchFailure: null,
    authorization: { state: 'authorized' },
    reauthorization: { state: 'not_applicable' },
    commandStatus: 'applied',
    observation: {
      protocol: 'syncml',
      observationScope: 'native_objects',
      receipts: [],
      progress: 'applied',
      effect: 'waiting',
    },
  }
  expect(await fixture(detail).adapter.command('pc', id)).toMatchObject({
    delivery: 'applied',
    kind: 'command',
    inputVersion: 'v1',
    observation: detail.observation,
    authorization: detail.authorization,
    registrationId: null,
  })
  await expect(
    fixture({ ...detail, commandId: registrationId }).adapter.command('pc', id),
  ).rejects.toThrow('Wrong command')
})
it('reads script runs directly from the policy contract with exact task and policy coordinates', async () => {
  const run = {
    kind: 'script',
    taskId: id,
    policyId: registrationId,
    versionId: id,
    device: 'pc',
    registrationId,
    generation: 2,
    occurrence: 'o',
    availableAt: 1,
    deadline: 100,
    resourceId: 'script',
    authorization: null,
    attemptId: id,
    result: {
      collectedAt: 1,
      receivedAt: 2,
      exitCode: 17,
      quality: 'failed',
      schemaValid: false,
      budgetValid: true,
      output: { reason: 'exit' },
      outputReference: null,
      diagnostics: {
        stdout: 'out',
        stderr: 'failure',
        durationMs: 1,
        executedAt: 1,
        failure: null,
      },
      trusted: false,
    },
    state: {
      delivery: { kind: 'queued' },
      execution: 'unknown',
      cancellation: 'none',
      deadline: 100,
      startedAt: null,
    },
  }
  expect(await fixture(run).adapter.run(registrationId, id)).toMatchObject({
    owner: 'script',
    kind: 'run',
    state: { execution: 'unknown' },
    versionId: id,
    occurrence: 'o',
    result: run.result,
    effect: null,
    attempt: id,
  })
  await expect(fixture({ ...run, policyId: id }).adapter.run(registrationId, id)).rejects.toThrow(
    'Wrong run',
  )
})

it('preserves DA result effects instead of mistaking the missing top-level field for absent evidence', async () => {
  const value = {
    kind: 'access',
    taskId: id,
    policyId: registrationId,
    versionId: id,
    device: 'pc',
    registrationId,
    generation: 2,
    occurrence: 'o',
    availableAt: 1,
    deadline: 100,
    authorization: null,
    attemptId: id,
    result: {
      bindingId: id,
      bindingGeneration: 1,
      revision: 2,
      definitionDigest: Array(32).fill(0),
      effect: { state: 'unknown' },
    },
    state: {
      delivery: { kind: 'queued' },
      execution: 'succeeded',
      cancellation: 'none',
      deadline: 100,
      startedAt: null,
    },
  }
  expect(await fixture(value).adapter.run(registrationId, id)).toMatchObject({
    state: { execution: 'succeeded' },
    effect: 'unknown',
    result: value.result,
  })
})

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
  expect(await fixture(null).adapter.trustObservation('device')).toBeNull()
})

it('projects the exact software attempt step digest from the formal 32-byte wire field', async () => {
  const stepId = [0, 1, 15, 16, 255, ...Array<number>(27).fill(171)]
  const value = {
    kind: 'software',
    taskId: id,
    policyId: registrationId,
    registrationId,
    device: 'pc',
    generation: 2,
    attemptId: id,
    availableAt: 1,
    deadline: 100,
    effect: 'unknown',
    userAction: null,
    result: null,
    state: {
      delivery: { kind: 'queued' },
      execution: 'unknown',
      cancellation: 'none',
      deadline: 100,
      startedAt: null,
    },
    nodes: [
      {
        stepId,
        definition: {
          resource: 'package',
          version: 'v1',
          variant: 'default',
          digest: Array<number>(32).fill(1),
        },
      },
    ],
  }
  expect(await fixture(value).adapter.run(registrationId, id)).toMatchObject({
    owner: 'software',
    attempt: id,
    nodes: [{ ...value.nodes[0], stepId: '00010f10ff' + 'ab'.repeat(27) }],
  })
  await expect(
    fixture({ ...value, nodes: [{ ...value.nodes[0], stepId: [1] }] }).adapter.run(
      registrationId,
      id,
    ),
  ).rejects.toThrow()
})
