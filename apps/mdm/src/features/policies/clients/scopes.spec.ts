import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createScopesClient, decodeScope, decodeScopePage } from './scopes'
const id = '11111111-1111-4111-8111-111111111111'
const result = '22222222-2222-4222-8222-222222222222'
const group = '33333333-3333-4333-8333-333333333333'
const resolution = { resolution: result, resolutionRevision: 1 }
const definition = {
  targets: [{ kind: 'device' as const, id: 'device-01' }],
  limitations: null,
  exclusions: [{ kind: 'group' as const, id: group }],
}
it('preserves unlimited and explicitly empty Scope limitations as different inputs', () => {
  expect(
    decodeScope({ ...resolution, id, revision: 1, definition }, id).definition.limitations,
  ).toBeNull()
  expect(
    decodeScope(
      { ...resolution, id, revision: 2, definition: { ...definition, limitations: [] } },
      id,
    ).definition.limitations,
  ).toEqual([])
  for (const bad of [
    undefined,
    {},
    false,
    [{ kind: 'tenant', id }],
    [{ kind: 'group', id: 'not-a-uuid' }],
  ]) {
    expect(() =>
      decodeScope(
        { ...resolution, id, revision: 1, definition: { ...definition, limitations: bad } },
        id,
      ),
    ).toThrow()
  }
  expect(() => decodeScope({ ...resolution, id: result, revision: 1, definition }, id)).toThrow()
  expect(() =>
    decodeScope(
      {
        ...resolution,
        id,
        revision: 1,
        definition: { ...definition, targets: [...definition.targets, ...definition.targets] },
      },
      id,
    ),
  ).toThrow()
})
it('binds Scope pages to channel and preserves typed targets and source references', () => {
  const page = {
    result,
    scope: id,
    current: false,
    channel: 'agent',
    page: {
      kind: 'decisions',
      items: [
        {
          object: { kind: 'endpoint', id: 'device-01' },
          qualification: { state: 'excluded' },
          reasons: ['explicit_exclusion'],
          targets: [{ reference: { kind: 'group', id: group }, version: 4 }],
          limitations: [],
          exclusions: [],
        },
      ],
    },
    nextCursor: 'opaque-tail',
  }
  expect(decodeScopePage(page, id, result, 'decisions', 'agent')).toEqual(page)
  for (const bad of [
    { ...page, channel: 'mdm' },
    { ...page, result: group },
    { ...page, page: { kind: 'members', items: ['device-01'] } },
    { ...page, totalObjects: 1 },
  ])
    expect(() => decodeScopePage(bad, id, result, 'decisions', 'agent')).toThrow()
  expect(
    decodeScopePage(
      { ...page, page: { kind: 'members', items: [] }, nextCursor: null },
      id,
      result,
      'members',
      'agent',
    ).page.items,
  ).toEqual([])
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
    path: '/api/v1/scopes/{id}',
    pathParams: { id },
    body,
    successStatus: 200,
  })
  reply = { ...resolution, id, revision: 2, definition }
  await client.read(id)
  expect(request.mock.calls[1]![0]).toMatchObject({
    method: 'GET',
    path: '/api/v1/scopes/{id}',
    successStatus: 200,
  })
  reply = {
    task: result,
    kind: 'scope',
    target: id,
    status: 'completed',
    processed: 1,
    members: 0,
    failure: null,
    failureDetail: null,
    replacementTask: null,
  }
  await client.status(id, result)
  expect(request.mock.calls[2]![0]).toMatchObject({
    method: 'GET',
    path: '/api/v1/scopes/{id}/tasks/{task}',
    pathParams: { id, task: result },
  })
  reply = {
    result,
    scope: id,
    current: true,
    channel: 'agent',
    page: { kind: 'members', items: [] },
    nextCursor: null,
  }
  await client.page(id, result, 'members', 'agent', 'opaque-tail')
  expect(request.mock.calls[3]![0]).toMatchObject({
    method: 'GET',
    path: '/api/v1/scopes/{id}/results/{result}/{projection}',
    pathParams: { id, result, projection: 'members' },
    query: { cursor: 'opaque-tail' },
  })
})

it('requires current Scope publication coordinates and rejects retired incomplete reads', () => {
  expect(decodeScope({ ...resolution, id, revision: 1, definition }, id)).toMatchObject(resolution)
  expect(
    decodeScope({ resolution: null, resolutionRevision: 0, id, revision: 1, definition }, id)
      .resolution,
  ).toBeNull()
  for (const invalid of [
    { id, revision: 1, definition },
    { ...resolution, id, revision: 1, definition, resolutionRevision: -1 },
    { ...resolution, id, revision: 1, definition, resolution: 'wrong' },
  ])
    expect(() => decodeScope(invalid, id)).toThrow()
})
