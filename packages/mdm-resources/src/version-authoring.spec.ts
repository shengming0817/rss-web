import { expect, it, vi } from 'vitest'
import {
  createResources,
  type PreparedResourceVersion,
  type ResourcesPort,
  type ResourceVersionDraft,
} from './index'

const operationId = '11111111-1111-4111-8111-111111111111'
const artifact = { reference: 'configuration', length: 1, sha256: Array<number>(32).fill(0) }
function draft(): ResourceVersionDraft {
  return {
    resource: 'resource',
    operationId,
    expectedRevision: 1,
    version: 'v2',
    kind: 'configuration',
    variants: [
      {
        key: 'main',
        platform: 'macos',
        architecture: 'aarch64',
        declaration: { kind: 'configuration', artifact },
      },
    ],
    contents: [
      {
        variant: 'main',
        platform: 'macos',
        architecture: 'aarch64',
        bytes: new Uint8Array([7]).buffer,
      },
    ],
  }
}
function prepared(source: ResourceVersionDraft): PreparedResourceVersion {
  return {
    resource: source.resource,
    change: {
      operationId,
      expectedRevision: 1,
      input: {
        action: 'version',
        kind: source.kind,
        version: source.version,
        variants: source.variants,
      },
    },
    materials: [
      {
        target: {
          resource: source.resource,
          version: source.version,
          variant: 'main',
          platform: 'macos',
          architecture: 'aarch64',
          artifact,
        },
        bytes: new Uint8Array([7]).buffer,
      },
    ],
  }
}
function port(methods: Partial<ResourcesPort>): ResourcesPort {
  return new Proxy(methods as ResourcesPort, {
    get(target, key) {
      if (!(key in target)) throw new Error(`Unexpected Resource write: ${String(key)}`)
      return Reflect.get(target, key)
    },
  })
}
it('prepares material separately from declaration while erasing adapter temporaries and retaining caller-owned input', async () => {
  const input = draft(),
    temporary = prepared(input),
    prepareVersion = vi.fn(async () => temporary),
    resources = createResources(port({ prepareVersion }))
  const result = await resources.prepareVersion(input)
  expect(prepareVersion).toHaveBeenCalledTimes(1)
  expect(Object.isFrozen(result.change.input.variants)).toBe(true)
  expect(new Uint8Array(result.materials[0]!.bytes)).toEqual(new Uint8Array([7]))
  expect(new Uint8Array(temporary.materials[0]!.bytes)).toEqual(new Uint8Array([0]))
  expect(new Uint8Array(input.contents[0]!.bytes)).toEqual(new Uint8Array([7]))
})
it('rejects mismatched exact-variant content before any adapter work', async () => {
  const input = draft(),
    prepareVersion = vi.fn(async () => prepared(input)),
    resources = createResources(port({ prepareVersion }))
  await expect(
    resources.prepareVersion({
      ...input,
      contents: [{ ...input.contents[0]!, architecture: 'x86_64' }],
    }),
  ).rejects.toThrow('Wrong bounded')
  expect(prepareVersion).not.toHaveBeenCalled()
})
it('rejects an adapter result for another request and erases all returned material', async () => {
  const input = draft(),
    temporary = prepared(input),
    wrong = {
      ...temporary,
      change: { ...temporary.change, operationId: '22222222-2222-4222-8222-222222222222' },
    },
    resources = createResources(port({ prepareVersion: async () => wrong }))
  await expect(resources.prepareVersion(input)).rejects.toThrow('Wrong prepared resource version')
  expect(new Uint8Array(temporary.materials[0]!.bytes)).toEqual(new Uint8Array([0]))
})
it('accepts a no-op lifecycle receipt without inventing a new resource revision or replaying unknown changes', async () => {
  const change = vi
      .fn<ResourcesPort['change']>()
      .mockResolvedValueOnce({ resource: 'resource', request: operationId, storageRevision: 4 })
      .mockRejectedValueOnce({ code: 'outcome_unknown' }),
    resources = createResources(port({ change })),
    original = {
      operationId,
      expectedRevision: 4,
      input: { action: 'activate' as const, version: 'v1' },
    }
  expect(await resources.change('resource', original)).toEqual({
    resource: 'resource',
    request: operationId,
    storageRevision: 4,
  })
  await expect(resources.change('resource', original)).rejects.toMatchObject({
    code: 'outcome_unknown',
  })
  expect(change).toHaveBeenCalledTimes(2)
  expect(change.mock.calls[1]?.[1]).toEqual(original)
})

it('correlates the Resource acknowledgement with the frozen lifecycle request across caller edits', async () => {
  let finish!: (value: { resource: string; request: string; storageRevision: number }) => void
  const change = vi.fn<ResourcesPort['change']>(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    ),
    resources = createResources(port({ change })),
    input = { action: 'activate' as const, version: 'v1' },
    original = { operationId, expectedRevision: 4, input },
    running = resources.change('resource', original)
  original.expectedRevision = 100
  input.version = 'changed-by-caller'
  finish({ resource: 'resource', request: operationId, storageRevision: 4 })
  await expect(running).resolves.toMatchObject({ storageRevision: 4 })
  expect(change.mock.calls[0]?.[1]).toMatchObject({ expectedRevision: 4, input: { version: 'v1' } })
})
