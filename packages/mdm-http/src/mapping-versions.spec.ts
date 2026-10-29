import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import type {
  AgentDefinition,
  MappingDeclaration,
  MappingDraft,
  MappingVariant,
  PreparedUpload,
  ScriptDefinition,
} from '@rss/mdm-inventory'
import { createMappingVersionsAdapter } from './mapping-versions'
import { encodeCollectionContent } from './mapping-content'

const operation = '11111111-1111-4111-8111-111111111111',
  uploadId = '22222222-2222-4222-8222-222222222222',
  resourceId = 'rss/collection.native'
const applicability = () => ({
  minimumOsVersion: null,
  minimumBuild: null,
  editions: [],
  enrollments: [],
  tools: {},
  capabilities: [],
})
function agentDefinition(): AgentDefinition {
  const budget = { timeoutSeconds: 30, outputBytes: 65536, maxRows: 1000 }
  return {
    applicability: applicability(),
    plan: {
      version: 1,
      scope: { kind: 'device' },
      budget,
      queries: {
        physical: {
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
        query: 'physical',
        missing: 'missing',
        mapping: { pointer: '/ready', conversion: { kind: 'identity' }, columns: {} },
      },
    },
  }
}
async function declaration(
  kind: 'agent_collection' | 'native_collection' = 'agent_collection',
): Promise<Exclude<MappingDeclaration, { kind: 'script' }>> {
  const artifact = { reference: 'collection.json', length: 1, sha256: Array<number>(32).fill(0) }
  const value: Exclude<MappingDeclaration, { kind: 'script' }> =
    kind === 'agent_collection'
      ? { kind, artifact, definition: agentDefinition() }
      : {
          kind,
          artifact,
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
  const bytes = encodeCollectionContent(value)
  return {
    ...value,
    artifact: {
      ...artifact,
      length: bytes.byteLength,
      sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))],
    },
  }
}
async function source(kind: 'agent_collection' | 'native_collection' = 'agent_collection') {
  const declared = await declaration(kind),
    variants: MappingVariant[] = ['x86_64', 'aarch64'].map((architecture) => ({
      key: 'collection',
      platform: 'windows',
      architecture: architecture as MappingVariant['architecture'],
      declaration: declared,
    }))
  return {
    id: resourceId,
    kind,
    origin: null,
    presentation: { name: 'Collection', unknownKey: { flag: false } },
    revision: 4,
    versions: [{ id: '1.0', state: 'active', digest: Array<number>(32).fill(7), variants }],
  }
}
function fixture(read: (options: RequestOptions<unknown>) => unknown | Promise<unknown>) {
  const request = vi.fn(async (options: RequestOptions<unknown>) =>
    options.decode(await read(options)),
  )
  return { transport: { request } as unknown as HttpTransport, request }
}
it('prepares one changed Agent architecture without moving the untouched shared artifact or physical plan', async () => {
  const original = await source(),
    selected = original.versions[0]!.variants[0]!,
    declaration = selected.declaration
  if (declaration.kind !== 'agent_collection') throw new Error('fixture')
  const binding = declaration.definition.mappings['custom.ready']!,
    changed: MappingVariant = {
      ...selected,
      declaration: {
        ...declaration,
        definition: {
          ...declaration.definition,
          mappings: {
            ...declaration.definition.mappings,
            'custom.ready': {
              ...binding,
              mapping: {
                pointer: '/state',
                conversion: { kind: 'enum', values: { off: false, zero: 0 } },
                columns: {
                  nested: { pointer: '/child', conversion: { kind: 'integer' }, columns: {} },
                },
              },
            },
          },
        },
      },
    },
    draft: MappingDraft = {
      resource: resourceId,
      expectedRevision: 4,
      baseVersion: '1.0',
      operationId: operation,
      version: '2.0',
      kind: 'agent_collection',
      variants: [changed, original.versions[0]!.variants[1]!],
    },
    f = fixture(() => original),
    client = createMappingVersionsAdapter(f.transport),
    prepared = await client.prepare(draft)
  expect(f.request).toHaveBeenCalledTimes(1)
  const edited = prepared.change.input.variants[0]!,
    untouched = prepared.change.input.variants[1]!
  expect(untouched.declaration).toEqual(original.versions[0]!.variants[1]!.declaration)
  expect(edited.declaration.artifact.reference).not.toBe(untouched.declaration.artifact.reference)
  expect(
    edited.declaration.kind === 'agent_collection' && edited.declaration.definition.plan,
  ).toEqual(declaration.definition.plan)
  expect(prepared.uploads).toHaveLength(2)
  const bytes = prepared.uploads.find((u) => u.target.architecture === 'x86_64')!.bytes,
    decoded = JSON.parse(new TextDecoder().decode(bytes))
  expect(decoded.mappings['custom.ready'].mapping.conversion.values).toEqual({
    off: false,
    zero: 0,
  })
  expect(decoded.mappings['custom.ready'].mapping.columns.nested.pointer).toBe('/child')
})
it('rejects changes to physical source plans or the observed Resource revision before any declaration', async () => {
  const original = await source(),
    selected = original.versions[0]!.variants[0]!,
    value = selected.declaration
  if (value.kind !== 'agent_collection') throw new Error('fixture')
  const f = fixture(() => original),
    client = createMappingVersionsAdapter(f.transport),
    draft: MappingDraft = {
      resource: resourceId,
      baseVersion: '1.0',
      operationId: operation,
      expectedRevision: 4,
      version: '2.0',
      kind: 'agent_collection',
      variants: [
        {
          ...selected,
          declaration: {
            ...value,
            definition: {
              ...value.definition,
              plan: {
                ...value.definition.plan,
                budget: { ...value.definition.plan.budget, maxRows: 1001 },
              },
            },
          },
        },
        original.versions[0]!.variants[1]!,
      ],
    }
  await expect(client.prepare(draft)).rejects.toMatchObject({
    cause: 'client',
    code: 'physical_plan_changed',
  })
  await expect(client.prepare({ ...draft, expectedRevision: 3 })).rejects.toMatchObject({
    status: 409,
    code: 'configuration_changed',
  })
  expect(f.request.mock.calls.every(([options]) => options.method === 'GET')).toBe(true)
})
async function originalUpload() {
  const resource = await source('native_collection'),
    target = resource.versions[0]!.variants[0]!,
    bytes = encodeCollectionContent(
      target.declaration as Exclude<MappingDeclaration, { kind: 'script' }>,
    ),
    upload: PreparedUpload = {
      id: uploadId,
      target: {
        resource: resourceId,
        version: '1.0',
        variant: target.key,
        platform: target.platform,
        architecture: target.architecture,
        artifact: target.declaration.artifact,
      },
      bytes,
    },
    session = {
      id: uploadId,
      offset: 0,
      complete: false,
      expires: 2000000000,
      binding: {
        actor: 'operator',
        reference: upload.target.artifact.reference,
        length: bytes.byteLength,
        sha256: [...upload.target.artifact.sha256],
        purpose: {
          kind: 'resource',
          binding: {
            resource: resourceId,
            version: '1.0',
            variant: target.key,
            platform: target.platform,
            architecture: target.architecture,
            resource_digest: resource.versions[0]!.digest,
            storage_class: 'native_configuration',
            inspection: null,
            source: null,
            origin: null,
          },
        },
      },
    }
  return { resource, upload, session }
}
it('verifies original upload target digest before beginning or restoring native content', async () => {
  const { resource, upload, session } = await originalUpload(),
    f = fixture((options) => (options.path === '/api/v1/resources/{id}' ? resource : session)),
    client = createMappingVersionsAdapter(f.transport)
  expect((await client.begin(upload)).resourceDigest).toEqual(resource.versions[0]!.digest)
  expect(f.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      method: 'POST',
      path: '/api/v1/resources/{id}/uploads/{upload}',
      pathParams: { id: resourceId, upload: uploadId },
      query: {
        version: '1.0',
        variant: 'collection',
        platform: 'windows',
        architecture: 'x86_64',
        artifact: upload.target.artifact.reference,
      },
    }),
  )
  const restored = await client.restore(resourceId, uploadId)
  expect(new Uint8Array(restored.bytes)).toEqual(new Uint8Array(upload.bytes))
  expect(restored.id).toBe(uploadId)
  session.binding.purpose.binding.resource_digest = Array<number>(32).fill(8)
  await expect(client.upload(upload)).rejects.toThrow('Wrong upload binding')
})
it('does not append changed bytes or accept a content receipt for another fixed version', async () => {
  const { resource, upload, session } = await originalUpload(),
    f = fixture((options) =>
      options.path === '/api/v1/resources/{id}'
        ? resource
        : options.path.includes('content-operations')
          ? {
              operationId: uploadId,
              resource: resourceId,
              committed: true,
              version: 'wrong',
              reference: upload.target.artifact.reference,
              length: upload.target.artifact.length,
              sha256: [...upload.target.artifact.sha256],
            }
          : session,
    ),
    client = createMappingVersionsAdapter(f.transport)
  new Uint8Array(upload.bytes).fill(0)
  await expect(client.append(upload, 0)).rejects.toMatchObject({
    cause: 'client',
    code: 'input_changed',
  })
  expect(f.request.mock.calls.some(([options]) => options.method === 'PATCH')).toBe(false)
  await expect(client.receipt(upload)).rejects.toThrow()
})

it('retains script source bytes and schemas while changing collection mappings in a fixed version', async () => {
  const encoded = new TextEncoder().encode('#!/bin/sh\n# Exact original source.\nprintf false\n')
  const bytes = new ArrayBuffer(encoded.byteLength)
  new Uint8Array(bytes).set(encoded)
  const artifact = {
      reference: 'original.sh',
      length: bytes.byteLength,
      sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))],
    },
    definition: ScriptDefinition = {
      profile: 'posix_sh',
      sql: null,
      runAs: 'system',
      encoding: 'utf8',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      bindings: {},
      output: {
        type: 'object',
        properties: { ready: { type: 'boolean' } },
        required: ['ready'],
        additionalProperties: false,
      },
      purpose: {
        kind: 'collection',
        scope: { kind: 'device' },
        applicability: applicability(),
        mappings: {
          'custom.ready': { pointer: '/ready', conversion: { kind: 'identity' }, columns: {} },
        },
      },
      timeoutSeconds: 30,
      outputBytes: 65536,
      maxRows: 100,
    },
    variant: MappingVariant = {
      key: 'script',
      platform: 'macos',
      architecture: 'aarch64',
      declaration: { kind: 'script', artifact, definition },
    },
    resource = {
      id: resourceId,
      kind: 'script',
      origin: null,
      presentation: { name: 'Script source' },
      revision: 4,
      versions: [
        { id: '1.0', state: 'active', digest: Array<number>(32).fill(7), variants: [variant] },
      ],
    },
    purpose = definition.purpose
  if (purpose.kind !== 'collection') throw new Error('fixture')
  const changed: MappingVariant = {
      ...variant,
      declaration: {
        kind: 'script',
        artifact,
        definition: {
          ...definition,
          purpose: {
            ...purpose,
            mappings: {
              'custom.ready': {
                pointer: '/new_ready',
                conversion: { kind: 'enum', values: { off: false, zero: 0 } },
                columns: {},
              },
            },
          },
        },
      },
    },
    f = fixture((options) =>
      options.path.endsWith('/script')
        ? {
            bytes: bytes.slice(0),
            contentType: 'application/octet-stream',
            contentDisposition: 'attachment; filename="script.txt"',
          }
        : resource,
    ),
    client = createMappingVersionsAdapter(f.transport),
    prepared = await client.prepare({
      resource: resourceId,
      expectedRevision: 4,
      operationId: operation,
      baseVersion: '1.0',
      version: '2.0',
      kind: 'script',
      variants: [changed],
    })
  expect(new Uint8Array(prepared.uploads[0]!.bytes)).toEqual(new Uint8Array(bytes))
  const output = prepared.change.input.variants[0]!.declaration
  expect(output.kind).toBe('script')
  if (output.kind !== 'script') throw new Error('fixture')
  expect(output.definition.parameters).toEqual(definition.parameters)
  expect(output.definition.output).toEqual(definition.output)
  expect(output.artifact).toEqual(artifact)
  expect(f.request.mock.calls.every(([options]) => options.method === 'GET')).toBe(true)
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      path: '/api/v1/resources/{id}/versions/{version}/script',
      pathParams: { id: resourceId, version: '1.0' },
      query: { platform: 'macos', architecture: 'aarch64', variant: 'script' },
    }),
  )
})
