import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createExecutionsClient } from './executions'
import { policyRun } from './runs'
const id = '11111111-1111-4111-8111-111111111111'
it('consumes the formal operation page and independent statistics with HTTP-owned locators', async () => {
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
    detailUrl: `/api/v1/policies/${id}/runs/${id}`,
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
  }
  let value: unknown = { items: [item], nextCursor: 'YWJj' }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(value)),
    client = createExecutionsClient({ request } as unknown as HttpTransport)
  expect((await client.directory({ filter: `policy=='${id}'` })).items[0]).toMatchObject({
    kind: 'action_run',
    registrationId: id,
    generation: 2,
  })
  await client.directory({
    filter: `policy=='${id}';kind=='action_run';status=='running'`,
    cursor: 'YWJj',
  })
  expect(request.mock.calls[1]?.[0]).toMatchObject({
    path: '/api/v1/operations',
    query: {
      filter: `policy=='${id}';kind=='action_run';status=='running'`,
      cursor: 'YWJj',
      limit: 20,
    },
  })
  value = { items: [{ ...item, detailUrl: 'https://other.test/' }], nextCursor: null }
  await expect(client.directory()).rejects.toThrow()
  value = { statistics: { total: 1, commands: 0, actionRuns: 1, unknown: 0 }, asOf: 100 }
  expect((await client.statistics(`policy=='${id}'`)).statistics.total).toBe(1)
  expect(request.mock.lastCall?.[0]).toMatchObject({
    path: '/api/v1/operations/statistics',
    query: { filter: `policy=='${id}'` },
  })
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

it('decodes the HTTP native observation and rejects incomplete evidence', async () => {
  const observation = {
    protocol: 'syncml',
    observationScope: 'native_objects',
    receipts: [],
    progress: 'received',
    effect: 'unverified',
  }
  let evidence: unknown = { commandStatus: 'received', dispatchFailure: null, observation }
  const request = vi.fn(async (options: RequestOptions<unknown>) =>
    options.decode({
      items: [
        {
          id,
          kind: 'command',
          device: 'endpoint',
          registrationId: id,
          generation: 1,
          origin: 'direct',
          policy: null,
          deadline: 100,
          status: 'received',
          detailUrl: `/api/v1/devices/endpoint/operations/${id}`,
          evidence,
        },
      ],
      nextCursor: null,
    }),
  )
  const client = createExecutionsClient({ request } as unknown as HttpTransport)
  expect((await client.directory()).items[0]?.evidence).toEqual({
    kind: 'command',
    commandStatus: 'received',
    dispatchFailure: null,
    observation,
  })
  evidence = {
    commandStatus: 'received',
    dispatchFailure: null,
    observation: { progress: 'succeeded', effect: 'unverified' },
  }
  await expect(client.directory()).rejects.toThrow()
})

it('decodes precisely the requested execution projection', async () => {
  const request = vi.fn(async (options: RequestOptions<unknown>) =>
    options.decode({ items: [{ id }], nextCursor: null }),
  )
  const client = createExecutionsClient({ request } as unknown as HttpTransport)
  expect((await client.directory({ fields: ['id'] })).items).toEqual([{ id }])
  expect(request.mock.lastCall?.[0].query).toEqual({ fields: 'id', limit: 20 })
  await expect(client.directory()).rejects.toThrow()
})
