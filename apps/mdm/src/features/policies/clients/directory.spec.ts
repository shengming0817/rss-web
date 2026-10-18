import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createExecutionsClient } from './executions'
import { softwareRun } from './runs'
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
    evidence: { state: 'running' },
    detailUrl: `/api/v1/policies/${id}/runs/${id}`,
  }
  let value: unknown = {
    items: [item],
    nextCursor: { id, kind: 'action_run' },
    statistics: { total: 1, commands: 0, actionRuns: 1, unknown: 0 },
    asOf: 1,
  }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(value)),
    client = createExecutionsClient({ request } as unknown as HttpTransport, id, false)
  expect((await client.directory({ policy: id })).items[0]).toMatchObject({
    kind: 'action_run',
    registrationId: id,
    generation: 2,
  })
  await client.directory({ policy: id, after: id, afterKind: 'action_run' })
  expect(request.mock.calls[1]?.[0]).toMatchObject({
    path: '/api/v1/operations',
    query: { policy: id, after: id, afterKind: 'action_run' },
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
  expect(softwareRun(run, false)).toMatchObject({
    effect: 'unverified',
    result: { kind: 'enrollment', entryOutcome: 'opened' },
  })
  expect(() => softwareRun({ ...run, result: { entryOutcome: 'enrolled' } }, false)).toThrow()
})
