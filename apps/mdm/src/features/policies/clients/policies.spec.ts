import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createPoliciesClient, decodePolicy, policyDefinition } from './policies'
const tenant = '11111111-1111-4111-8111-111111111111'
const definition = {
  source: 'resource' as const,
  parameters: {},
  resource: 'fw',
  resourceVersion: '1',
  scope: tenant,
  enabled: true,
  exitBehavior: 'cancel' as const,
  trigger: { kind: 'on_change' as const },
  validity: null,
}
const policy = {
  id: 'fw',
  revision: 1,
  archived: false,
  definition,
  computation: { sequence: 4, status: 'waiting', at: 1 },
  members: [],
}
it('separates editing revision from computation and rejects retired Plan wire', () => {
  expect(decodePolicy(policy, 'fw')).toEqual(policy)
  expect(() => decodePolicy({ ...policy, plan: 'old' }, 'fw')).toThrow()
  expect(() => decodePolicy(policy, 'other')).toThrow()
  expect(() =>
    policyDefinition({ ...definition, trigger: { kind: 'interval', seconds: 0 } }),
  ).toThrow()
  expect(() => policyDefinition({ ...definition, validity: { start: 10, end: 1 } })).toThrow()
})
it('binds candidate responses to tenant/source and never requests save or execute', async () => {
  let response: unknown = { contract: 'policies-v1', tenantId: tenant, source: 'mock', policy }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(response)),
    transport = { request } as unknown as HttpTransport
  const client = createPoliciesClient(transport, tenant, true)
  const body = {
    operationId: tenant,
    expectedRevision: 0,
    input: { action: 'put' as const, definition },
  }
  expect(await client.change('fw', body)).toEqual(policy)
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    path: '/api/v1/mdm-candidate/policies/assignments/{id}',
    body,
  })
  await expect(createPoliciesClient(transport, tenant, false).read('fw')).rejects.toThrow()
  response = { contract: 'policies-v1', tenantId: tenant, source: 'mock', members: [] }
  expect(await client.preview('fw', definition)).toEqual([])
  expect(request.mock.calls.at(-1)?.[0]).toMatchObject({
    path: '/api/v1/mdm-candidate/policies/assignments/{id}/preview',
    body: { definition },
  })
})
