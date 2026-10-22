import { defaultApplicability, identityMapping } from './collection-mapping'
import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createResourcesClient, decodeResource, decodeScriptSpec } from './resources'
const operationId = '11111111-1111-4111-8111-111111111111'
it('consumes the complete formal resource directory header', async () => {
  const item = {
    id: 'profile',
    revision: 3,
    kind: 'telemetry_profile',
    activeVersion: 'v1',
    presentation: { name: 'Collection', vendor: { labels: ['retained'] } },
  }
  let response: unknown = { items: [item], nextCursor: null }
  const client = createResourcesClient({
    request: async (options: RequestOptions<unknown>) => options.decode(response),
  } as HttpTransport)
  expect((await client.list('telemetry_profile')).items).toEqual([item])
  response = { items: [{ ...item, presentation: null }], nextCursor: null }
  await expect(client.list()).rejects.toThrow()
})
const digest = Array.from({ length: 32 }, () => 0)
const spec = {
  profile: 'power_shell7',
  sql: null,
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
  origin: null,
  presentation: {},
  id: 'script-library',
  revision: 2,
  kind: 'script',
  versions: [
    {
      id: 'v1',

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
  const sourced = { ...resource, origin: { blueprint: 'inventory', version: '1', digest } }
  expect(decodeResource(sourced, resource.id)).toEqual(sourced)
  expect(() =>
    decodeResource({ ...sourced, origin: { ...sourced.origin, digest: [0] } }, resource.id),
  ).toThrow()
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
    profile: 'osquery',
    sql: 'SELECT version FROM osquery_info',
    purpose: {
      kind: 'collection',
      scope: { kind: 'device' },
      applicability: defaultApplicability(),
      mappings: { 'custom.osquery.version': identityMapping('/0/version') },
    },
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
    input: {
      action: 'version',
      kind: 'configuration',
      version: 'v2',
      variants: [
        {
          platform: 'windows',
          architecture: 'x86_64',
          key: 'default',
          declaration: { kind: 'configuration', artifact },
        },
      ],
    },
  })
  expect(request.mock.calls[0]![0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/resources/{id}',
    pathParams: { id: resource.id },
    successStatus: 200,
    body: {
      operationId,
      expectedRevision: 2,
      input: {
        action: 'version',
        kind: 'configuration',
        version: 'v2',
        variants: [
          {
            platform: 'windows',
            architecture: 'x86_64',
            key: 'default',
            declaration: { kind: 'configuration', artifact },
          },
        ],
      },
    },
  })
  expect(request).toHaveBeenCalledTimes(1)
})

it('decodes complete SoftwareSpec and refuses the retired flat software contract', () => {
  const definition = {
    source: { id: 'private', revision: '1', sha256: digest },
    package: 'app',
    version: '1',
    artifacts: { installer: { ...artifact, origin: null } },
    reboot: 'report',
    downgrade: 'deny',
    dependencies: [],
    provenance: { kind: 'private' },
    signatures: [],
    export: { kind: 'disabled' },
    material: { bundle_id: null, format: 'msi', installer: 'installer' },
    behavior: {
      kind: 'msi',
      installer: 'installer',
      scope: 'system',
      install: {
        runAs: 'system',
        arguments: [],
        environment: {},
        timeoutSeconds: 60,
        outputBytes: 1024,
        exitCodes: { success: [0], reboot: [3010] },
      },
      upgradeInvocation: {
        runAs: 'system',
        arguments: [],
        environment: {},
        timeoutSeconds: 60,
        outputBytes: 1024,
        exitCodes: { success: [0], reboot: [3010] },
      },
      upgrade: 'in_place',
      uninstall: null,
      detect: {
        kind: 'msi_product',
        productCode: '{11111111-1111-4111-8111-111111111111}',
        version: '1',
      },
    },
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

it('decodes artifact-only native declarations and rejects retired Resource configuration fields', () => {
  const native = {
    ...resource,
    kind: 'configuration',
    versions: [
      {
        ...resource.versions[0],
        variants: [
          {
            platform: 'windows',
            architecture: 'x86_64',
            key: 'default',
            declaration: { kind: 'configuration', artifact },
          },
        ],
      },
    ],
  }
  expect(decodeResource(native, native.id)).toEqual(native)
  expect(() =>
    decodeResource(
      { ...native, versions: [{ ...native.versions[0], configuration: null }] },
      native.id,
    ),
  ).toThrow()
  expect(() =>
    decodeResource(
      {
        ...native,
        versions: [
          {
            ...native.versions[0],
            variants: [
              {
                ...native.versions[0]!.variants[0],
                declaration: {
                  kind: 'configuration',
                  artifact,
                  schema: 'old',
                  apply: 'old',
                  detect: 'old',
                  remove: null,
                },
              },
            ],
          },
        ],
      },
      native.id,
    ),
  ).toThrow()
})

it('consumes the instantiated Resource read shape without treating it as a normal change receipt', async () => {
  const sample = (await import('../../../../demo/policies/blueprints.json')).default.packages[0]!
  const id = '22222222-2222-4222-8222-222222222222'
  const value = {
    id,
    revision: 2,
    kind: sample.kind,
    presentation: sample.presentation,
    origin: { blueprint: sample.id, version: sample.version, digest: sample.versionDigest },
    versions: [
      {
        id: `builtin.${sample.id}.${sample.version}`,
        digest: sample.versionDigest,
        state: 'frozen',
        variants: ['x86_64', 'aarch64'].map((architecture) => ({
          platform: sample.platform,
          architecture,
          key: architecture,
          declaration: {
            kind: sample.kind,
            artifact: {
              reference: sample.reference,
              length: new TextEncoder().encode(sample.content).length,
              sha256: sample.sha256,
            },
            definition: JSON.parse(sample.content) as unknown,
          },
        })),
      },
    ],
  }
  let reply: unknown = value
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply))
  const client = createResourcesClient({ request } as unknown as HttpTransport)
  const body = {
    operationId,
    expectedRevision: 0,
    input: { action: 'instantiate' as const, blueprint: sample.id, version: sample.version },
  }
  expect(await client.change(id, body)).toEqual(value)
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]![0].body).toEqual(body)
  reply = { resource: id, request: operationId, storageRevision: 2 }
  await expect(client.change(id, body)).rejects.toThrow()
})
