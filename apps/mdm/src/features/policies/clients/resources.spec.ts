import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createResourcesClient, decodeResource, decodeScriptSpec } from './resources'
const operationId = '11111111-1111-4111-8111-111111111111'
const digest = Array.from({ length: 32 }, () => 0)
const spec = {
  profile: 'power_shell7',
  runAs: 'system',
  encoding: 'utf8',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  bindings: {},
  output: { type: 'object' },
  purpose: { kind: 'action' },
  timeoutSeconds: 60,
  outputBytes: 16384,
  maxRows: 1,
}
const artifact = { reference: 'content-1', length: 12, sha256: digest }
const resource = {
  id: 'script-library',
  revision: 2,
  kind: 'script',
  versions: [
    {
      id: 'v1',
      configuration: null,
      digest,
      state: 'frozen',
      variants: [
        {
          platform: 'windows',
          architecture: 'x86_64',
          key: 'default',
          declaration: { kind: 'script', artifact, definition: spec },
        },
      ],
    },
  ],
}
it('decodes current resource and ScriptSpec wire without private wrapper shapes', () => {
  expect(decodeResource(resource, resource.id)).toEqual(resource)
  expect(decodeScriptSpec(spec)).toEqual(spec)
  for (const value of [
    { ...resource, id: 'other' },
    { ...resource, versions: [{ ...resource.versions[0], digest: [0] }] },
  ])
    expect(() => decodeResource(value, resource.id)).toThrow()
  for (const value of [
    { ...spec, profile: 'powershell' },
    { ...spec, outputBytes: 1_048_577 },
    { ...spec, maxRows: 0 },
    { ...spec, encoding: 'utf16' },
  ])
    expect(() => decodeScriptSpec(value)).toThrow()
})
it('preserves finite collection bindings and rejects invented collection field identities', () => {
  const value = {
    ...spec,
    profile: 'osquery_info_v1',
    purpose: { kind: 'collection', mappings: { 'custom.osquery.version': '/0/version' } },
  }
  expect(decodeScriptSpec(value).purpose).toEqual(value.purpose)
  expect(() =>
    decodeScriptSpec({
      ...value,
      purpose: { kind: 'collection', mappings: { password: '/secret' } },
    }),
  ).toThrow()
})
it('keeps version creation and activation as separate CAS writes', async () => {
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode({ resource: resource.id, request: operationId, storageRevision: 3 }),
  )
  const client = createResourcesClient({ request } as unknown as HttpTransport)
  await client.change(resource.id, {
    operationId,
    expectedRevision: 2,
    input: { action: 'firewall_version', version: 'v2', enabled: true },
  })
  expect(request.mock.calls[0]![0]).toMatchObject({
    method: 'POST',
    path: '/api/v3/resources/{id}',
    pathParams: { id: resource.id },
    successStatus: 200,
    body: {
      operationId,
      expectedRevision: 2,
      input: { action: 'firewall_version', version: 'v2', enabled: true },
    },
  })
  expect(request).toHaveBeenCalledTimes(1)
})

it('accepts only the empty 201 upload acknowledgement and does not retain file names', async () => {
  let reply: unknown = ''
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply))
  const client = createResourcesClient({ request } as unknown as HttpTransport)
  const bytes = new Uint8Array([0, 10, 255]).buffer
  const target = {
    version: 'v1',
    variant: 'default',
    platform: 'windows' as const,
    architecture: 'x86_64' as const,
  }
  await expect(client.upload('script-library', target, bytes)).resolves.toBeUndefined()
  expect(request.mock.calls[0]![0]).toMatchObject({
    method: 'POST',
    path: '/api/v3/resources/{id}/content',
    pathParams: { id: 'script-library' },
    query: target,
    headers: { 'Content-Type': 'application/octet-stream' },
    successStatus: 201,
  })
  expect(request.mock.calls[0]![0].body).toBe(bytes)
  reply = { accepted: true }
  await expect(client.upload('script-library', target, bytes)).rejects.toThrow()
})
