import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createExecutionsClient } from './executions'
import { policyRun } from './runs'
const id = '11111111-1111-4111-8111-111111111111'
it('consumes the formal mixed operation directory without following server-provided URLs', async () => {
  const item = {
    id,
    kind: 'action_run',
    device: 'endpoint',
    registrationId: id,
    generation: 2,
    origin: 'policy',
    policy: id,
    deadline: 100,
    status: 'running',
    evidence: {
      state: {
        delivery: { kind: 'queued' },
        execution: 'running',
        cancellation: 'none',
        deadline: 100,
        startedAt: 1,
      },
      effect: 'unverified',
      result: null,
    },
    detailUrl: `/api/v1/policies/${id}/runs/${id}`,
  }
  let value: unknown = {
    items: [item],
    nextCursor: { id, kind: 'action_run' },
    statistics: { total: 1, commands: 0, actionRuns: 1, unknown: 0 },
    asOf: 1,
  }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(value)),
    client = createExecutionsClient({ request } as unknown as HttpTransport)
  expect((await client.directory({ policy: id })).items[0]).toMatchObject({
    kind: 'action_run',
    registrationId: id,
    generation: 2,
  })
  await client.directory({
    policy: id,
    after: id,
    afterKind: 'action_run',
    kind: 'action_run',
    status: 'running',
  })
  expect(request.mock.calls[1]?.[0]).toMatchObject({
    path: '/api/v1/operations',
    query: {
      policy: id,
      after: id,
      afterKind: 'action_run',
      kind: 'action_run',
      status: 'running',
    },
  })
  value = {
    items: [{ ...item, detailUrl: 'https://other.test/' }],
    nextCursor: null,
    statistics: { total: 1, commands: 0, actionRuns: 1, unknown: 0 },
    asOf: 1,
  }
  await expect(client.directory()).rejects.toThrow('Wrong operation locator')
})
it('keeps an opened enrollment entry distinct from MDM enrollment or installation success', () => {
  const state = {
    delivery: { kind: 'queued' },
    execution: 'succeeded',
    cancellation: 'none',
    deadline: 100,
    startedAt: 1,
  }
  const run = {
    taskId: id,
    device: 'endpoint',
    registrationId: id,
    generation: 2,
    availableAt: 1,
    deadline: 100,
    state,
    effect: 'unverified',
    userAction: null,
    result: { entryOutcome: 'opened', diagnostics: null },
    occurrence: 'once',
  }
  expect(policyRun(run, false)).toMatchObject({
    effect: 'unverified',
    result: { kind: 'enrollment', entryOutcome: 'opened' },
  })
  expect(() => policyRun({ ...run, result: { entryOutcome: 'enrolled' } }, false)).toThrow()
})

it('separates redacted collection summaries from authorized native detail evidence', () => {
  const state = {
    delivery: { kind: 'queued' },
    execution: 'succeeded',
    cancellation: 'none',
    deadline: 100,
    startedAt: 1,
  }
  const projection = {
    queries: {
      updates: {
        queryDigest: Array(32).fill(1),
        collectedAt: 2,
        status: 'complete',
        enumerationComplete: true,
        rowCount: 1,
      },
    },
    planDigest: Array(32).fill(2),
    outputReference: { bytes: 512, sha256: 'a'.repeat(64) },
    trusted: true,
    receivedAt: 3,
  }
  const common = {
    taskId: id,
    device: 'endpoint',
    registrationId: id,
    generation: 2,
    availableAt: 1,
    deadline: 100,
    state,
    effect: 'unverified',
    userAction: null,
  }
  const summary = policyRun(
    { ...common, occurrence: 'collection', result: { ...projection, diagnostics: null } },
    false,
  )
  expect(summary.result).toMatchObject({
    kind: 'collection',
    queries: { updates: { rowCount: 1, enumerationComplete: true } },
  })
  expect(summary.result).not.toHaveProperty('native')
  const native = { queries: { updates: { rows: [{ owner: 'private-user' }] } } }
  const detail = policyRun({ ...common, policyId: id, result: { ...projection, native } }, true)
  expect(detail.result).toMatchObject({ kind: 'collection', native })
  expect(() =>
    policyRun({ ...common, occurrence: 'collection', result: { ...projection, native } }, false),
  ).toThrow()
  expect(() =>
    policyRun({ ...common, policyId: id, result: { ...projection, native, unknown: true } }, true),
  ).toThrow()
})

it('keeps formal native observations distinct from an effect claim and accepts absent optional installation evidence', async () => {
  const device = 'endpoint~+'
  let evidence: unknown = {
    commandStatus: 'received',
    dispatchFailure: null,
    observation: {
      protocol: 'syncml',
      observationScope: 'native_objects',
      progress: 'succeeded',
      effect: 'unverified',
      receipts: [],
    },
  }
  const request = vi.fn(async (options: RequestOptions<unknown>) =>
    options.decode({
      items: [
        {
          id,
          kind: 'command',
          device,
          registrationId: id,
          generation: 1,
          origin: 'direct',
          policy: null,
          deadline: 100,
          status: 'received',
          evidence,
          detailUrl: `/api/v1/devices/endpoint%7E%2B/operations/${id}`,
        },
      ],
      nextCursor: null,
      statistics: { total: 1, commands: 1, actionRuns: 0, unknown: 0 },
      asOf: 1,
    }),
  )
  const client = createExecutionsClient({ request } as unknown as HttpTransport)
  expect((await client.directory()).items[0]?.evidence).toMatchObject({
    kind: 'command',
    agentInstallation: null,
    observation: { progress: 'succeeded', effect: 'unverified' },
  })
  evidence = {
    commandStatus: 'received',
    dispatchFailure: null,
    observation: {
      protocol: 'syncml',
      observationScope: 'native_objects',
      progress: 'succeeded',
      effect: 'unverified',
      receipts: [],
      privateOutput: 'forbidden',
    },
  }
  await expect(client.directory()).rejects.toThrow()
})
