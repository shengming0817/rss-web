import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createScriptsClient, decodeRun, decodeRunPage } from './scripts'
const plan = '11111111-1111-4111-8111-111111111111'
const task = '22222222-2222-4222-8222-222222222222'
const registration = '33333333-3333-4333-8333-333333333333'
const state = {
  delivery: { kind: 'received', attempt: task, leaseUntil: 200 },
  execution: 'unknown',
  cancellation: 'requested',
  deadline: 300,
  startedAt: 100,
}
const summary = {
  taskId: task,
  device: 'device-01',
  registrationId: registration,
  generation: 3,
  occurrence: 1,
  availableAt: 90,
  deadline: 300,
  state,
  effect: 'unverified',
  result: null,
}
it('preserves unknown execution and cancellation request after received delivery', () => {
  const page = { items: [summary], nextCursor: { availableAt: 90, taskId: task } }
  expect(decodeRunPage(page)).toEqual(page)
  expect(() =>
    decodeRunPage({ items: [{ ...summary, output: 'must be detail only' }], nextCursor: null }),
  ).toThrow()
  expect(() =>
    decodeRunPage({ items: [{ ...summary, effect: 'verified_present' }], nextCursor: null }),
  ).toThrow()
})
it('accepts bounded multiline diagnostic output only in a bound run detail', () => {
  const { occurrence, ...detail } = summary
  expect(occurrence).toBe(1)
  const result = {
    exitCode: 0,
    quality: 'complete',
    schemaValid: true,
    trusted: true,
    output: { version: '1.0' },
    diagnostics: {
      durationMs: 10,
      executedAt: 110,
      failure: null,
      stdout: 'line\n'.repeat(1000),
      stderr: '',
    },
  }
  const value = { ...detail, planId: plan, result }
  expect(decodeRun(value, plan, task)).toEqual(value)
  expect(() => decodeRun(value, registration, task)).toThrow()
  expect(() =>
    decodeRun(
      {
        ...value,
        result: { ...result, diagnostics: { ...result.diagnostics, stdout: 'x'.repeat(16_385) } },
      },
      plan,
      task,
    ),
  ).toThrow()
  expect(() => decodeRunPage({ items: [{ ...summary, result }], nextCursor: null })).toThrow()
})
it('uses script approval operationId only and cursor afterAt/afterId pairs', async () => {
  let reply: unknown = { planId: plan, revision: 1, authorization: 'approved' }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply))
  const client = createScriptsClient({ request } as unknown as HttpTransport)
  await client.approve(plan, task)
  expect(request.mock.calls[0]![0]).toMatchObject({
    method: 'POST',
    path: '/api/v3/script-plans/{id}/approve',
    pathParams: { id: plan },
    body: { operationId: task },
    successStatus: 200,
  })
  reply = { planId: plan, cancelRequested: true }
  await client.cancel(plan, task)
  expect(request.mock.calls[1]![0]).toMatchObject({
    method: 'POST',
    path: '/api/v3/script-plans/{id}/cancel',
    body: { operationId: task },
    successStatus: 200,
  })
  reply = { items: [], nextCursor: null }
  await client.runs(plan, { availableAt: 90, taskId: task })
  expect(request.mock.calls[2]![0]).toMatchObject({
    method: 'GET',
    path: '/api/v3/script-plans/{id}/runs',
    query: { afterAt: 90, afterId: task },
    successStatus: 200,
  })
})
