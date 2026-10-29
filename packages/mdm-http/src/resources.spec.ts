import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import {
  createResources,
  materialTarget,
  type Declaration,
  type ResourceKind,
  type ResourceVersionDraft,
} from '@rss/mdm-resources'
import { createResourcesAdapter } from './resources'
import { declarationInput } from './resource-values'

const operationId = '11111111-1111-4111-8111-111111111111',
  hash = () => Array<number>(32).fill(3),
  artifact = () => ({ reference: 'content/material', length: 3, sha256: hash() }),
  applicability = () => ({
    minimumOsVersion: null,
    minimumBuild: null,
    editions: [],
    enrollments: [],
    tools: {},
    capabilities: [],
  })
function declaration(kind: ResourceKind): Declaration {
  const budget = { timeoutSeconds: 30, outputBytes: 65536, maxRows: 100 }
  switch (kind) {
    case 'configuration':
      return { kind, artifact: artifact() }
    case 'script':
      return {
        kind,
        artifact: artifact(),
        definition: {
          ...budget,
          profile: 'power_shell7',
          sql: null,
          runAs: 'system',
          encoding: 'utf8',
          parameters: {
            type: 'object',
            properties: { enabled: { type: 'boolean', const: false } },
            required: ['enabled'],
            additionalProperties: false,
          },
          bindings: { enabled: { kind: 'named', name: 'Enabled' } },
          output: { type: 'object', properties: { count: { type: 'integer', const: 0 } } },
          purpose: { kind: 'action' },
        },
      }
    case 'native_collection':
      return {
        kind,
        artifact: artifact(),
        definition: {
          scope: { kind: 'device' },
          applicability: applicability(),
          adapter: 'windows_read',
          timeoutSeconds: 30,
          outputBytes: 65536,
          mappings: {
            'custom.ready': {
              query: { kind: 'enrollment_id' },
              mapping: { pointer: '', conversion: { kind: 'identity' }, columns: {} },
            },
          },
        },
      }
    case 'agent_collection':
      return {
        kind,
        artifact: artifact(),
        definition: {
          applicability: applicability(),
          plan: {
            version: 1,
            scope: { kind: 'device' },
            budget,
            queries: {
              cpu: {
                version: 1,
                definition: { kind: 'windows_cpu' },
                cardinality: 'exactly_one',
                instanceKeys: [],
                budget,
              },
            },
          },
          mappings: {
            'custom.ready': {
              query: 'cpu',
              missing: 'missing',
              mapping: {
                pointer: '/ready',
                conversion: { kind: 'enum', values: { off: false, zero: 0 } },
                columns: {},
              },
            },
          },
        },
      }
    case 'telemetry_profile':
      return {
        kind,
        artifact: artifact(),
        definition: {
          template: {
            resource: 'company/template',
            version: 'fixed-v1',
            variant: 'main',
            platform: 'windows',
            architecture: 'x86_64',
          },
          parameters: { flag: false, count: 0 },
          fields: [{ key: 'custom.ready', version: 1 }],
          projection: 'both',
          sampleMillis: 1000,
          uploadMillis: 5000,
          budget: {
            points: 100,
            bytes: 65536,
            resources: 4,
            executionMillis: 1000,
            outputBytes: 65536,
          },
          boost: { sampleMillis: 500, expiresAt: 1900000000 },
          backfillSeconds: 3600,
        },
      }
    case 'software':
      return {
        kind,
        definition: {
          source: { id: 'company/private', revision: '1', sha256: hash() },
          package: 'Company.App',
          version: '1.2',
          provenance: { kind: 'private' },
          artifacts: { installer: { ...artifact(), reference: 'content/setup.msi', origin: null } },
          material: { bundleId: null, format: 'msi', installer: 'installer' },
          behavior: null,
          signatures: [],
          dependencies: [],
          reboot: 'report',
          downgrade: 'deny',
          export: { kind: 'disabled' },
        },
      }
  }
}
function wire(kind: ResourceKind) {
  const declared = declarationInput(declaration(kind)),
    variant = { key: 'main', platform: 'windows', architecture: 'x86_64', declaration: declared }
  return {
    id: 'company/resource',
    kind,
    revision: 4,
    presentation: { name: 'Resource', custom: { flag: false, count: 0 } },
    origin: null,
    versions: [
      {
        id: 'v1',
        state: 'active',
        digest: hash(),
        variants:
          kind === 'native_collection'
            ? [variant, { ...variant, architecture: 'aarch64' }]
            : [variant],
      },
    ],
  }
}
function fixture(read: (options: RequestOptions<unknown>) => unknown | Promise<unknown>) {
  const request = vi.fn(async (options: RequestOptions<unknown>) =>
      options.decode(await read(options)),
    ),
    adapter = createResourcesAdapter({ request } as unknown as HttpTransport)
  return { request, adapter, resources: createResources(adapter) }
}
it('reads every Resource family with exact definitions, immutable coordinates and unknown metadata intact', async () => {
  for (const kind of [
    'software',
    'script',
    'configuration',
    'native_collection',
    'agent_collection',
    'telemetry_profile',
  ] as const) {
    const value = wire(kind),
      f = fixture(() => value),
      result = await f.resources.read(value.id)
    expect(result.presentation).toEqual(value.presentation)
    expect(result.versions[0]?.variants[0]?.declaration).toEqual(declaration(kind))
    expect(f.request).toHaveBeenCalledTimes(1)
    expect(f.request.mock.calls[0]?.[0]).toMatchObject({
      method: 'GET',
      path: '/api/v1/resources/{id}',
      pathParams: { id: value.id },
    })
    expect(result.versions[0]?.state).toBe('active')
  }
})
it('keeps a single projected software catalog and combines its fixed kind with the server query without detail fan-out', async () => {
  const f = fixture(() => ({
    items: [
      {
        id: 'company/resource',
        kind: 'software',
        revision: 4,
        activeVersion: 'v1',
        presentation: { name: 'App' },
      },
    ],
    nextCursor: 'b3BhcXVl',
  }))
  const result = await f.resources.list(
    {
      filter: "id=='company/resource'",
      fields: ['id', 'kind', 'revision', 'activeVersion', 'presentation'],
      limit: 1,
    },
    'software',
  )
  expect(result.items).toHaveLength(1)
  expect(f.request).toHaveBeenCalledTimes(1)
  expect(f.request.mock.calls[0]?.[0]).toMatchObject({
    path: '/api/v1/resources',
    query: {
      filter: "(kind==software);(id=='company/resource')",
      fields: 'id,kind,revision,activeVersion,presentation',
      limit: 1,
    },
  })
})
it('rejects wrong Resource identity, repeated fixed versions, duplicate coordinates and mixed declaration kinds', async () => {
  const value = wire('configuration'),
    version = value.versions[0]!,
    variant = version.variants[0]!
  for (const malformed of [
    { ...value, id: 'another' },
    { ...value, versions: [version, version] },
    { ...value, versions: [{ ...version, variants: [variant, variant] }] },
    { ...value, kind: 'software' },
  ]) {
    const f = fixture(() => malformed)
    await expect(f.resources.read(value.id)).rejects.toThrow()
  }
})
it('preserves an unedited configuration artifact but requires explicit bytes for a changed fixed source', async () => {
  const f = fixture(() => wire('configuration')),
    source = await f.resources.read('company/resource'),
    draft: ResourceVersionDraft = {
      resource: source.id,
      expectedRevision: 4,
      operationId,
      version: 'v2',
      kind: 'configuration',
      variants: source.versions[0]!.variants,
      contents: [],
    }
  const prepared = await f.resources.prepareVersion(draft)
  expect(prepared.change.input.variants).toEqual(draft.variants)
  expect(prepared.materials).toEqual([])
  const selected = draft.variants[0]!
  await expect(
    f.resources.prepareVersion({
      ...draft,
      variants: [
        {
          ...selected,
          declaration: {
            kind: 'configuration',
            artifact: { ...artifact(), reference: 'content/new' },
          },
        },
      ],
    }),
  ).rejects.toMatchObject({ code: 'material_source_required' })
  await expect(f.resources.prepareVersion({ ...draft, expectedRevision: 3 })).rejects.toMatchObject(
    { status: 409, code: 'configuration_changed' },
  )
  expect(f.request.mock.calls.every(([options]) => options.method === 'GET')).toBe(true)
})
it('prepares actual script bytes and all author fields separately from any declaration or upload', async () => {
  const f = fixture(() => wire('script')),
    source = await f.resources.read('company/resource'),
    bytes = new Uint8Array(new TextEncoder().encode('Write-Output 0')).buffer,
    prepared = await f.resources.prepareVersion({
      resource: source.id,
      expectedRevision: 4,
      operationId,
      version: 'v2',
      kind: 'script',
      variants: source.versions[0]!.variants,
      contents: [{ variant: 'main', platform: 'windows', architecture: 'x86_64', bytes }],
    })
  expect(prepared.materials[0]?.target.artifact.length).toBe(bytes.byteLength)
  expect(prepared.change.input.variants[0]?.declaration).toMatchObject({
    definition: {
      bindings: { enabled: { kind: 'named', name: 'Enabled' } },
      output: { properties: { count: { const: 0 } } },
    },
  })
  expect(new Uint8Array(prepared.materials[0]!.bytes)).toEqual(new Uint8Array(bytes))
  expect(f.request.mock.calls.every(([options]) => options.method === 'GET')).toBe(true)
})
it('uses immutable Artifact.reference rather than software map keys', async () => {
  const f = fixture(() => wire('software')),
    source = await f.resources.read('company/resource')
  expect(
    materialTarget(source, {
      version: 'v1',
      variant: 'main',
      platform: 'windows',
      architecture: 'x86_64',
      artifact: 'content/setup.msi',
    }).artifact.reference,
  ).toBe('content/setup.msi')
  expect(() =>
    materialTarget(source, {
      version: 'v1',
      variant: 'main',
      platform: 'windows',
      architecture: 'x86_64',
      artifact: 'installer',
    }),
  ).toThrow('Missing exact material reference')
})
it('preserves unknown presentation values on a no-op write and propagates backend archive reference protection', async () => {
  const value = wire('configuration'),
    change = {
      operationId,
      expectedRevision: 4,
      input: { action: 'present' as const, presentation: value.presentation },
    },
    f = fixture(() => ({ resource: value.id, request: operationId, storageRevision: 4 }))
  await f.resources.change(value.id, change)
  expect(f.request.mock.calls[0]?.[0].body).toEqual(change)
  const denied = fixture(() => {
    throw { status: 409, code: 'resource_referenced' }
  })
  await expect(
    denied.resources.change(value.id, {
      operationId,
      expectedRevision: 4,
      input: { action: 'archive', version: 'v1' },
    }),
  ).rejects.toMatchObject({ code: 'resource_referenced' })
  expect(denied.request).toHaveBeenCalledTimes(1)
})

it('retains all three Blueprint definition families and correlates instantiation with its exact origin', async () => {
  const agent = declaration('agent_collection'),
    native = declaration('native_collection')
  if (agent.kind !== 'agent_collection' || native.kind !== 'native_collection')
    throw new Error('fixture')
  const configuration = {
      target: { kind: 'device' },
      apply: { platform: 'macos', request: { kind: 'declarations', assets: [], declarations: [] } },
      remove: {
        platform: 'macos',
        request: { kind: 'declarations', assets: [], declarations: [] },
      },
    },
    definitions = [
      { kind: 'agent_collection', template: agent.definition },
      { kind: 'native_collection', template: native.definition },
      { kind: 'configuration', content: configuration },
    ],
    catalog = {
      categories: ['identity', 'hardware', 'software', 'security', 'management', 'updates'],
      items: definitions.map((definition, index) => ({
        id: `official-${index}`,
        version: '1',
        platform: index === 2 ? 'macos' : 'windows',
        presentation: { category: 'hardware', custom: { flag: false, count: 0 } },
        definition,
      })),
    },
    f = fixture(() => catalog)
  expect(await f.resources.blueprints()).toEqual(catalog)
  const source = {
      ...wire('configuration'),
      origin: { blueprint: 'official-2', version: '1', digest: hash() },
    },
    instantiated = fixture(() => source),
    change = {
      operationId,
      expectedRevision: 0,
      input: { action: 'instantiate' as const, blueprint: 'official-2', version: '1' },
    }
  expect(await instantiated.resources.change(source.id, change)).toMatchObject({
    origin: source.origin,
    versions: source.versions,
  })
  const wrong = fixture(() => ({ ...source, origin: { ...source.origin, version: '2' } }))
  await expect(wrong.resources.change(source.id, change)).rejects.toThrow(
    'Wrong instantiated resource',
  )
})
