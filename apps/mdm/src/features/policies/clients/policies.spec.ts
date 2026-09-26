import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createPoliciesClient, decodePolicy, decodePolicyPage } from './policies'
const task = '11111111-1111-4111-8111-111111111111'
const scope = '22222222-2222-4222-8222-222222222222'
const id = 'firewall-policy'
const policy = {
  id,
  storageRevision: 8,
  revision: 3,
  status: 'active',
  plan: 'digest',
  fresh: true,
}
it('keeps storage CAS, policy version and saved-plan freshness distinct', () => {
  expect(decodePolicy(policy, id)).toEqual(policy)
  expect(decodePolicy({ ...policy, fresh: false }, id).fresh).toBe(false)
  for (const bad of [
    { ...policy, id: 'other' },
    { ...policy, storageRevision: -1 },
    { ...policy, status: 'published' },
    { ...policy, unexpected: true },
  ])
    expect(() => decodePolicy(bad, id)).toThrow()
})
it('preserves snake-case predecessor version and binds immutable policy pages', () => {
  const execution = { device: 'device-01', version: 2, progress: 'unknown', effect: 'unverified' }
  const page = {
    result: task,
    policy: id,
    plan: 'digest',
    totalTargets: 1,
    totalExecutions: 1,
    page: { kind: 'intents', items: [{ kind: 'predecessor', execution, successor_version: 3 }] },
    nextCursor: 'tail',
  }
  expect(decodePolicyPage(page, id, task, 'predecessors')).toEqual(page)
  expect(() => decodePolicyPage(page, id, task, 'add')).toThrow()
  expect(() => decodePolicyPage({ ...page, policy: 'other' }, id, task, 'predecessors')).toThrow()
  expect(() =>
    decodePolicyPage(
      {
        ...page,
        page: { kind: 'intents', items: [{ kind: 'predecessor', execution, successorVersion: 3 }] },
      },
      id,
      task,
      'predecessors',
    ),
  ).toThrow()
  expect(
    decodePolicyPage(
      { ...page, page: { kind: 'targets', items: [] }, nextCursor: null },
      id,
      task,
      'targets',
    ).nextCursor,
  ).toBeNull()
})
it('follows preview, fixed result, save and execute contracts without a fabricated approve request', async () => {
  let reply: unknown = {
    task,
    kind: 'policy',
    target: id,
    statusUrl: `/api/v2/plan-previews/${task}`,
  }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply))
  const client = createPoliciesClient({ request } as unknown as HttpTransport)
  const preview = { operationId: task, expectedRevision: 8, input: { scope, expectedRevision: 8 } }
  await client.preview(id, preview)
  expect(request.mock.calls[0]![0]).toMatchObject({
    method: 'POST',
    path: '/api/v2/policies/{id}/previews',
    pathParams: { id },
    body: preview,
    successStatus: 202,
  })
  reply = {
    task,
    kind: 'policy',
    target: id,
    status: 'completed',
    processed: 1,
    members: 1,
    plan: 'digest',
    failure: null,
    failureDetail: null,
    execution: null,
    policyRevision: 3,
  }
  await client.status(id, task)
  expect(request.mock.calls[1]![0]).toMatchObject({
    method: 'GET',
    path: '/api/v2/plan-previews/{task}',
    pathParams: { task },
    successStatus: 200,
  })
  reply = {
    receipt: {
      policy: id,
      request: scope,
      storageRevision: 9,
      planId: 'digest',
      planIsFresh: true,
      task: null,
    },
    preview: task,
    plan: 'digest',
    dispatch: 'not_requested',
  }
  const saved = await client.save(id, {
    operationId: scope,
    expectedRevision: 8,
    input: { preview: task },
  })
  expect(saved.dispatch).toBe('not_requested')
  expect(request.mock.calls[2]![0]).toMatchObject({
    method: 'POST',
    path: '/api/v2/policies/{id}/plans',
    successStatus: 200,
    body: { expectedRevision: 8, input: { preview: task } },
  })
  reply = { plan: task, operations: [{ operationId: task, commandId: scope, accepted: true }] }
  await client.execute(id, 'digest', {
    operationId: task,
    expectedRevision: 9,
    deadline: 4102444800,
  })
  expect(request.mock.calls[3]![0]).toMatchObject({
    method: 'POST',
    path: '/api/v2/policies/{id}/plans/{plan}/execute',
    pathParams: { id, plan: 'digest' },
    successStatus: 202,
    body: { expectedRevision: 9, deadline: 4102444800 },
  })
  expect(request).toHaveBeenCalledTimes(4)
})
it('rejects a mismatched accepted task URL instead of following a server-provided location', async () => {
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode({ task, kind: 'policy', target: id, statusUrl: 'https://other.invalid/private' }),
  )
  await expect(
    createPoliciesClient({ request } as unknown as HttpTransport).preview(id, {
      operationId: task,
      expectedRevision: 8,
      input: { scope, expectedRevision: 8 },
    }),
  ).rejects.toThrow()
  expect(request).toHaveBeenCalledTimes(1)
})
