import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createScopesClient, decodeScope, decodeScopePage } from './scopes'
const id = '11111111-1111-4111-8111-111111111111'
const result = '22222222-2222-4222-8222-222222222222'
const group = '33333333-3333-4333-8333-333333333333'
const definition = {
  targets: [{ kind: 'device' as const, id: 'device-01' }],
  limitations: null,
  exclusions: [{ kind: 'group' as const, id: group }],
}
it('preserves unlimited and explicitly empty Scope limitations as different inputs', () => {
  expect(decodeScope({ id, revision: 1, definition }, id).definition.limitations).toBeNull()
  expect(
    decodeScope({ id, revision: 2, definition: { ...definition, limitations: [] } }, id).definition
      .limitations,
  ).toEqual([])
  for (const bad of [
    undefined,
    {},
    false,
    [{ kind: 'tenant', id }],
    [{ kind: 'group', id: 'not-a-uuid' }],
  ]) {
    expect(() =>
      decodeScope({ id, revision: 1, definition: { ...definition, limitations: bad } }, id),
    ).toThrow()
  }
  expect(() => decodeScope({ id: result, revision: 1, definition }, id)).toThrow()
  expect(() =>
    decodeScope(
      {
        id,
        revision: 1,
        definition: { ...definition, targets: [...definition.targets, ...definition.targets] },
      },
      id,
    ),
  ).toThrow()
})
it('binds Scope result pages to scope/result/projection and preserves frozen published sources', () => {
  const page = {
    result,
    scope: id,
    current: false,
    totalObjects: 1,
    totalMembers: 0,
    sources: [
      {
        reference: { kind: 'group', id: group },
        memberSet: result,
        memberVersion: 4,
        definitionVersion: 2,
        authorityVersion: 3,
      },
    ],
    page: {
      kind: 'decisions',
      items: [
        { device: 'device-01', identity: 'active', reasons: ['explicit_exclusion'], sources: [0] },
      ],
    },
    nextCursor: 'opaque-tail',
  }
  expect(decodeScopePage(page, id, result, 'decisions')).toEqual(page)
  for (const bad of [
    { ...page, scope: group },
    { ...page, result: group },
    { ...page, page: { kind: 'members', items: [] } },
    {
      ...page,
      page: {
        kind: 'decisions',
        items: [{ device: 'device-01', identity: 'active', reasons: ['invented'], sources: [0] }],
      },
    },
  ]) {
    expect(() => decodeScopePage(bad, id, result, 'decisions')).toThrow()
  }
  expect(
    decodeScopePage(
      { ...page, sources: [], page: { kind: 'members', items: [] }, nextCursor: null },
      id,
      result,
      'members',
    ).nextCursor,
  ).toBeNull()
})
it('uses exact Scope paths and CAS bodies without manufacturing a list or preview endpoint', async () => {
  let reply: unknown = { id, revision: 2, task: result }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply))
  const client = createScopesClient({ request } as unknown as HttpTransport)
  const body = {
    operationId: result,
    expectedRevision: 1,
    input: { action: 'put' as const, definition },
  }
  await expect(client.change(id, body)).resolves.toEqual(reply)
  expect(request.mock.calls[0]![0]).toMatchObject({
    method: 'POST',
    path: '/api/v2/scopes/{id}',
    pathParams: { id },
    body,
    successStatus: 200,
  })
  reply = { id, revision: 2, definition }
  await client.read(id)
  expect(request.mock.calls[1]![0]).toMatchObject({
    method: 'GET',
    path: '/api/v2/scopes/{id}',
    successStatus: 200,
  })
  reply = {
    task: result,
    kind: 'scope',
    target: id,
    status: 'completed',
    processed: 1,
    members: 0,
    plan: null,
    failure: null,
    failureDetail: null,
    execution: null,
    policyRevision: null,
  }
  await client.status(id, result)
  expect(request.mock.calls[2]![0]).toMatchObject({
    method: 'GET',
    path: '/api/v2/scopes/{id}/tasks/{task}',
    pathParams: { id, task: result },
  })
  reply = {
    result,
    scope: id,
    current: true,
    totalObjects: 1,
    totalMembers: 0,
    sources: [],
    page: { kind: 'members', items: [] },
    nextCursor: null,
  }
  await client.page(id, result, 'members', 'opaque-tail')
  expect(request.mock.calls[3]![0]).toMatchObject({
    method: 'GET',
    path: '/api/v2/scopes/{id}/results/{result}/{projection}',
    pathParams: { id, result, projection: 'members' },
    query: { cursor: 'opaque-tail' },
  })
})
