import { createHash, randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createResourceDemo } from './resources'
import type { DemoRequest } from '../scenario'
const actor = { principalId: randomUUID(), sessionId: randomUUID() }
function request(path: string, body?: unknown, query = new URLSearchParams()): DemoRequest {
  return { path, method: body === undefined ? 'GET' : 'POST', body, query, headers: {}, actor }
}
it('verifies raw upload length and digest, permits exact bytes replay, and refuses archive of a referenced version', () => {
  const referenced = new Set<string>(),
    resources = createResourceDemo((id, version) => referenced.has(`${id}/${version}`))
  const id = 'collect-agent',
    bytes = new ArrayBuffer(11)
  new Uint8Array(bytes).set(new TextEncoder().encode('echo hello\n'))
  let revision = 0
  function change(input: unknown) {
    const reply = resources.handle(
      request(`/api/v1/resources/${id}`, {
        operationId: randomUUID(),
        expectedRevision: revision,
        input,
      }),
      'normal',
    )!
    if (reply.status === 200) revision++
    return reply
  }
  expect(change({ action: 'create', kind: 'script' }).status).toBe(200)
  expect(
    change({
      action: 'version',
      kind: 'script',
      version: '1',
      variants: [
        {
          platform: 'macos',
          architecture: 'aarch64',
          key: 'default',
          declaration: {
            kind: 'script',
            artifact: {
              reference: 'hello',
              length: bytes.byteLength,
              sha256: [...createHash('sha256').update(new Uint8Array(bytes)).digest()],
            },
            definition: {
              profile: 'posix_sh',
              sql: null,
              runAs: 'system',
              encoding: 'utf8',
              parameters: {
                type: 'object',
                properties: {},
                required: [],
                additionalProperties: false,
              },
              bindings: {},
              output: { type: 'object' },
              purpose: { kind: 'action' },
              timeoutSeconds: 30,
              outputBytes: 1024,
              maxRows: 1,
            },
          },
        },
      ],
    }).status,
  ).toBe(200)
  const query = new URLSearchParams({
    version: '1',
    variant: 'default',
    platform: 'macos',
    architecture: 'aarch64',
  })
  expect(
    resources.handle(
      request(`/api/v1/resources/${id}/content`, new ArrayBuffer(bytes.byteLength), query),
      'normal',
    )?.status,
  ).toBe(409)
  expect(change({ action: 'activate', version: '1' }).status).toBe(409)
  expect(
    resources.handle(request(`/api/v1/resources/${id}/content`, bytes, query), 'normal')?.status,
  ).toBe(201)
  expect(
    resources.handle(request(`/api/v1/resources/${id}/content`, bytes, query), 'normal')?.status,
  ).toBe(201)
  expect(change({ action: 'activate', version: '1' }).status).toBe(200)
  referenced.add(`${id}/1`)
  expect(change({ action: 'archive', version: '1' }).status).toBe(409)
  expect(resources.read(id)?.versions[0]?.state).toBe('active')
})

it('instantiates exact standard package versions across all six categories with immediately usable canonical content', () => {
  const resources = createResourceDemo(() => false)
  const catalog = resources.handle(request('/api/v1/collection-blueprints'), 'normal')!.body as {
    categories: string[]
    items: { id: string; version: string; presentation: { category: string } }[]
  }
  expect(new Set(catalog.items.map((b) => b.presentation.category))).toEqual(
    new Set(catalog.categories),
  )
  for (const blueprint of catalog.items) {
    const id = randomUUID(),
      body = {
        operationId: randomUUID(),
        expectedRevision: 0,
        input: { action: 'instantiate', blueprint: blueprint.id, version: blueprint.version },
      }
    expect(resources.handle(request(`/api/v1/resources/${id}`, body), 'normal')?.status).toBe(200)
    const value = resources.read(id)!
    expect(value.revision).toBe(2)
    expect(value.origin?.blueprint).toBe(blueprint.id)
    expect(value.versions[0]?.id).toBe(`builtin.${blueprint.id}.${blueprint.version}`)
    expect(
      resources.handle(
        request(`/api/v1/resources/${id}`, {
          operationId: randomUUID(),
          expectedRevision: 2,
          input: { action: 'activate', version: value.versions[0]!.id },
        }),
        'normal',
      )?.status,
    ).toBe(200)
  }
})
