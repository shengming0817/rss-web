import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createPoliciesClient } from './policies'
import { decodePolicy, defaultSchedule, policyDefinition, selfService } from './model'
const id = '11111111-1111-4111-8111-111111111111'
const definition = {
  scope: id,
  action: {
    kind: 'execution' as const,
    resource: {
      id: 'script',
      version: '1',
      platform: 'windows' as const,
      architecture: 'x86_64' as const,
      variant: 'default',
    },
    parameters: { level: { kind: 'fixed' as const, value: 1 } },
    schedule: defaultSchedule(),
    frequency: 'once_per_version' as const,
    runLifetimeSeconds: 3600,
  },
}
const policy = { id, revision: 1, version: 1, versionId: id, state: 'enabled', definition }
const metadata = {
  access: { kind: 'authenticated_user' },
  published: true,
  displayName: 'Diagnostics',
  description: '',
  prerequisites: '',
  sideEffects: '',
  category: 'Support',
  keywords: [],
  allowAi: false,
  riskLevel: 1,
}
it('accepts only the closed formal Policy and rejects the retired candidate DTO', () => {
  expect(decodePolicy(policy, id)).toMatchObject({ id, enabled: true, definition })
  for (const value of [
    { ...policy, computation: {} },
    { contract: 'policies-v1', policy },
    { ...policy, definition: { source: 'resource', resource: 'script', scope: id } },
    { ...policy, archived: false },
  ])
    expect(() => decodePolicy(value)).toThrow()
  expect(() => decodePolicy(policy, crypto.randomUUID())).toThrow()
  expect(
    selfService({
      ...metadata,
      description: 'Step one\nStep two',
      prerequisites: 'One\nTwo',
      sideEffects: 'First\nSecond',
    }),
  ).toMatchObject({ description: 'Step one\nStep two' })
  expect(() => selfService({ ...metadata, description: 'bad\0value' })).toThrow()
  expect(selfService(metadata)).toMatchObject({ allowAi: false, riskLevel: 1 })
  for (const riskLevel of [0, 3, '2', null])
    expect(() => selfService({ ...metadata, riskLevel })).toThrow()
  expect(() =>
    policyDefinition({
      ...definition,
      action: {
        ...definition.action,
        parameters: { unexpected: { kind: 'shell', value: 'injection' } },
      },
    }),
  ).toThrow()
  expect(() =>
    policyDefinition({
      ...definition,
      action: {
        ...definition.action,
        parameters: { level: { kind: 'input' } },
        schedule: { ...defaultSchedule(), trigger: { kind: 'check_in', minimumSeconds: 60 } },
      },
    }),
  ).toThrow()
})
it('uses formal V1 collection and operation/CAS without a candidate fallback or automatic replay', async () => {
  let response: unknown = policy
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(response)),
    client = createPoliciesClient({ request } as unknown as HttpTransport)
  const body = {
    operationId: id,
    expectedRevision: 0,
    input: { action: 'put' as const, definition, enabled: true },
  }
  expect(await client.change(id, body)).toMatchObject({ id, enabled: true, definition })
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/policies/{id}',
    pathParams: { id },
    body,
  })
  response = { items: [policy], nextCursor: null }
  expect((await client.list(undefined, 'execution')).items).toMatchObject([
    { id, enabled: true, definition },
  ])
  expect(request.mock.calls.at(-1)?.[0]).toMatchObject({
    path: '/api/v1/policies',
    query: { action: 'execution', limit: 20 },
  })
  request.mockRejectedValueOnce(new Error('lost response'))
  await expect(client.change(id, body)).rejects.toThrow('lost response')
  expect(request).toHaveBeenCalledTimes(3)
})

it.each(['enabled', 'disabled', 'archived'] as const)(
  'preserves Policy state %s independently of the enabled presentation value',
  (state) => {
    expect(decodePolicy({ ...policy, state })).toMatchObject({
      state,
      enabled: state === 'enabled',
    })
  },
)
it('sends archive only through the existing DELETE body and never retries a lost response', async () => {
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode({ ...policy, state: 'archived', revision: 3 }),
  )
  const client = createPoliciesClient({ request } as unknown as HttpTransport)
  const body = { operationId: id, expectedRevision: 2, input: { action: 'archive' as const } }
  expect(await client.change(id, body)).toMatchObject({ state: 'archived', enabled: false })
  expect(request.mock.calls[0]![0]).toMatchObject({ method: 'DELETE', pathParams: { id } })
  expect(request.mock.calls[0]![0].body).toEqual({ operationId: id, expectedRevision: 2 })
  request.mockRejectedValueOnce(new Error('response lost'))
  await expect(client.change(id, body)).rejects.toThrow('response lost')
  expect(request).toHaveBeenCalledTimes(2)
})
