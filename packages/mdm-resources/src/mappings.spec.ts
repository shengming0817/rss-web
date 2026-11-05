import { expect, it, vi } from 'vitest'
import { createMappings, replaceDeclaration, resourceId, validateDraft } from './index'
import type {
  MappingDraft,
  MappingVariant,
  MappingPort,
  NativeDefinition,
  PreparedMapping,
  PreparedMaterial,
} from './index'

const operation = '11111111-1111-4111-8111-111111111111'
const artifact = () => ({
  reference: 'native/windows.json',
  length: 1,
  sha256: Array<number>(32).fill(0),
})
function definition(): NativeDefinition {
  return {
    scope: { kind: 'device' },
    applicability: {
      minimumOsVersion: null,
      minimumBuild: null,
      editions: [],
      enrollments: [],
      tools: {},
      capabilities: [],
    },
    adapter: 'windows_read',
    mappings: {
      'custom.ready': {
        query: { kind: 'scalar', uri: './Vendor/MSFT/Ready' },
        mapping: {
          pointer: '',
          conversion: { kind: 'enum', values: { '0': false, '1': true } },
          columns: {},
        },
      },
    },
    timeoutSeconds: 30,
    outputBytes: 65536,
  }
}
function variant(architecture: MappingVariant['architecture'] = 'x86_64'): MappingVariant {
  return {
    key: 'collection',
    platform: 'windows',
    architecture,
    declaration: { kind: 'native_collection', artifact: artifact(), definition: definition() },
  }
}
function draft(): MappingDraft {
  return {
    resource: 'rss/collection.native',
    baseVersion: '1.0',
    operationId: operation,
    expectedRevision: 4,
    version: '2.0',
    kind: 'native_collection',
    variants: [variant(), variant('aarch64')],
  }
}
function prepared(): PreparedMapping {
  const source = draft()
  return {
    resource: source.resource,
    change: {
      operationId: operation,
      expectedRevision: 4,
      input: {
        action: 'version',
        version: '2.0',
        kind: 'native_collection',
        variants: source.variants,
      },
    },
    materials: [
      {
        target: {
          resource: source.resource,
          version: '2.0',
          variant: 'collection',
          platform: 'windows',
          architecture: 'x86_64',
          artifact: artifact(),
        },
        bytes: new ArrayBuffer(1),
      },
    ],
  }
}
function port(methods: Partial<MappingPort>): MappingPort {
  return new Proxy(methods as MappingPort, {
    get(target, key) {
      if (!(key in target)) throw new Error(`Unexpected port call: ${String(key)}`)
      return Reflect.get(target, key)
    },
  })
}
it('accepts formal non-UUID Resource IDs and rejects unsafe or ambiguous path segments', () => {
  expect(resourceId('rss/collection.native')).toBe('rss/collection.native')
  validateDraft(draft())
  for (const value of [
    '',
    '../source',
    'source//v1',
    'source/./v1',
    'source/../v1',
    '/source',
    'source/版本',
  ])
    expect(() => resourceId(value)).toThrow()
})
it('updates native paired architectures while preserving each variant artifact and other platforms', () => {
  const source = draft().variants,
    chosen = source[0]!,
    edited = definition()
  const original = edited.mappings['custom.ready']!
  const definitionChange: NativeDefinition = {
    ...edited,
    mappings: {
      ...edited.mappings,
      'custom.ready': { ...original, mapping: { ...original.mapping, pointer: '/enabled' } },
    },
  }
  const result = replaceDeclaration([...source, { ...variant(), platform: 'macos' }], chosen, {
    kind: 'native_collection',
    artifact: artifact(),
    definition: definitionChange,
  })
  for (const paired of result.slice(0, 2)) {
    expect(paired.declaration.kind).toBe('native_collection')
    expect(paired.declaration.definition).toEqual(definitionChange)
    expect(paired.declaration.artifact).toEqual(artifact())
  }
  expect(result[2]?.declaration.definition).toEqual(definition())
  expect(source[0]?.declaration.definition).toEqual(definition())
})
it('separates read-only byte preparation from explicit declaration and upload actions', async () => {
  const temporary = prepared()
  new Uint8Array(temporary.materials[0]!.bytes).fill(7)
  const prepare = vi.fn(async () => temporary),
    mappings = createMappings(port({ prepare }))
  const result = await mappings.prepare(draft())
  expect(prepare).toHaveBeenCalledTimes(1)
  expect(Object.isFrozen(result.change.input.variants)).toBe(true)
  expect(result.materials[0]?.bytes.byteLength).toBe(1)
  expect(new Uint8Array(result.materials[0]!.bytes)).toEqual(new Uint8Array([7]))
  expect(new Uint8Array(temporary.materials[0]!.bytes)).toEqual(new Uint8Array([0]))
})
it('does not replay an unknown declaration or advance an upload without explicit calls', async () => {
  const declare = vi.fn(async () => {
      throw { status: 503, code: 'operation_unknown' }
    }),
    mappings = createMappings(port({ declare }))
  const original = prepared()
  await expect(mappings.declare(original)).rejects.toMatchObject({ code: 'operation_unknown' })
  expect(declare).toHaveBeenCalledTimes(1)
  expect(declare).toHaveBeenCalledWith(original.resource, original.change)
})
it('restores the observed material coordinate with an explicit script content source', async () => {
  const material = prepared().materials[0]!,
    restore = vi.fn(async () => material),
    mappings = createMappings(port({ restore }))
  await mappings.restore(material.target, { version: '1.0' })
  expect(restore).toHaveBeenCalledWith(material.target, { version: '1.0' }, undefined)
  await expect(mappings.restore({ ...material.target, version: 'other' })).rejects.toThrow(
    'Wrong restored material',
  )
})

it('erases the temporary restore buffer after transferring its immutable copy to the caller', async () => {
  const temporary = prepared().materials[0]!
  new Uint8Array(temporary.bytes).fill(9)
  const mappings = createMappings(port({ restore: async () => temporary }))
  const result = await mappings.restore(temporary.target)
  expect(new Uint8Array(result.bytes)).toEqual(new Uint8Array([9]))
  expect(new Uint8Array(temporary.bytes)).toEqual(new Uint8Array([0]))
})

it('preserves independent native groups on the same platform when changing a chosen pair', () => {
  const first = variant(),
    second = variant('aarch64'),
    other = { ...definition(), outputBytes: 131072 },
    source = [
      first,
      second,
      {
        ...variant(),
        key: 'other',
        declaration: {
          kind: 'native_collection' as const,
          artifact: artifact(),
          definition: other,
        },
      },
      {
        ...variant('aarch64'),
        key: 'other',
        declaration: {
          kind: 'native_collection' as const,
          artifact: artifact(),
          definition: other,
        },
      },
    ],
    changed = { ...definition(), timeoutSeconds: 45 },
    result = replaceDeclaration(source, first, {
      kind: 'native_collection',
      artifact: artifact(),
      definition: changed,
    })
  expect(result.slice(0, 2).map((item) => item.declaration.definition)).toEqual([changed, changed])
  expect(result.slice(2)).toEqual(source.slice(2))
})

it('passes restoration cancellation to the port and erases material delivered after it was cancelled', async () => {
  const controller = new AbortController(),
    temporary = prepared().materials[0]!
  new Uint8Array(temporary.bytes).fill(7)
  let finish!: (value: PreparedMaterial) => void
  const restore = vi.fn<MappingPort['restore']>(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    ),
    mappings = createMappings(port({ restore })),
    running = mappings.restore(temporary.target, undefined, controller.signal)
  expect(restore.mock.calls[0]?.[2]).toBe(controller.signal)
  controller.abort()
  finish(temporary)
  await expect(running).rejects.toThrow('cancelled')
  expect(new Uint8Array(temporary.bytes)).toEqual(new Uint8Array([0]))
})
