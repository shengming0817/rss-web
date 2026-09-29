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

it('decodes complete SoftwareSpec and refuses the retired flat software contract', () => {
  const definition = {
    source: { id: 'private', revision: '1', sha256: digest },
    package: 'app',
    version: '1',
    format: 'msi',
    primary: 'installer',
    artifacts: { installer: { ...artifact, origin: null } },
    install: {
      executor: 'msi',
      entry: null,
      runAs: 'system',
      arguments: [],
      environment: {},
      timeoutSeconds: 60,
      outputBytes: 1024,
    },
    uninstall: null,
    detect: {
      kind: 'msi_product',
      productCode: '{11111111-1111-4111-8111-111111111111}',
      version: '1',
    },
    reboot: 'report',
    downgrade: 'deny',
    ownership: 'managed_only',
    dependencies: [],
    bundle: null,
  }
  const value = {
    ...resource,
    kind: 'software',
    versions: [
      {
        ...resource.versions[0],
        variants: [
          {
            platform: 'windows',
            architecture: 'x86_64',
            key: 'main',
            declaration: { kind: 'software', definition },
          },
        ],
      },
    ],
  }
  expect(decodeResource(value, resource.id)).toEqual(value)
})
