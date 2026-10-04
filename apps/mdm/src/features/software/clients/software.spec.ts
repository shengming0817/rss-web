import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { decodeResource } from '../../policies/clients/resources'
import { createAdmissionClient } from './admission'
import { createPublicationClient } from './publication'
const digest = Array<number>(32).fill(3)
const operationId = '11111111-1111-4111-8111-111111111111'
const command = {
  executor: 'msi',
  entry: null,
  runAs: 'system',
  arguments: [],
  environment: {},
  timeoutSeconds: 3600,
  outputBytes: 16384,
}
const definition = {
  source: { id: 'private', revision: '1', sha256: digest },
  package: 'Example.App',
  version: '1.0',
  format: 'msi',
  primary: 'installer',
  artifacts: { installer: { reference: 'installer', origin: null, length: 12, sha256: digest } },
  install: command,
  uninstall: null,
  detect: {
    kind: 'msi_product',
    productCode: '{11111111-1111-4111-8111-111111111111}',
    version: '1.0',
  },
  reboot: 'report',
  downgrade: 'deny',
  ownership: 'managed_only',
  dependencies: [],
  bundle: null,
}
function resource(declaration: unknown) {
  return {
    id: 'app',
    revision: 2,
    kind: 'software',
    versions: [
      {
        id: '1',
        digest,
        configuration: null,
        state: 'frozen',
        variants: [{ platform: 'windows', architecture: 'x86_64', key: 'main', declaration }],
      },
    ],
  }
}
it('accepts the complete current Resource software definition and rejects the retired flat declaration', () => {
  const value = resource({ kind: 'software', definition })
  expect(decodeResource(value, 'app')).toEqual(value)
  expect(() =>
    decodeResource(
      resource({
        kind: 'software',
        artifact: definition.artifacts.installer,
        source: 'private',
        package: 'app',
        version: '1',
        install: 'install',
        detect: 'detect',
        uninstall: null,
      }),
      'app',
    ),
  ).toThrow()
  expect(() =>
    decodeResource(
      resource({ kind: 'software', definition: { ...definition, format: 'npm' } }),
      'app',
    ),
  ).toThrow()
  expect(() =>
    decodeResource(
      resource({ kind: 'software', definition: { ...definition, primary: 'missing' } }),
      'app',
    ),
  ).toThrow()
})
it('keeps enterprise version admission on the v3 contract with distinct read and write receipts', async () => {
  const admission = {
    revision: 1,
    state: 'approved',
    operation: operationId,
    actor: 'reviewer',
    evidence: ['verified'],
    at: 1,
    digest,
  }
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode(
      o.method === 'GET'
        ? { resource: 'app', version: '1', resourceDigest: digest, admission }
        : { resource: 'app', version: '1', admission },
    ),
  )
  const client = createAdmissionClient({ request } as unknown as HttpTransport)
  expect((await client.version('app', '1')).admission?.state).toBe('approved')
  await client.changeVersion('app', '1', {
    operationId,
    expectedRevision: 0,
    input: { action: 'approve', evidence: ['verified'] },
  })
  expect(request.mock.calls.map(([o]) => o.path)).toEqual([
    '/api/v1/software/resources/{id}/versions/{version}',
    '/api/v1/software/resources/{id}/versions/{version}',
  ])
  expect(request.mock.calls[1]![0]).toMatchObject({
    successStatus: 200,
    pathParams: { id: 'app', version: '1' },
    body: { expectedRevision: 0 },
  })
})
it('uses the existing v1 publication wire, retains unknown outcomes and refuses malformed or wrong-target results', async () => {
  let reply: unknown = {
    id: 'candidate',
    revision: 3,
    contentDigest: digest,
    manifestDigest: digest,
    sourceSnapshot: digest,
    disposition: 'active',
    rings: ['test', 'pilot', 'production'].map((ring) => ({
      ring,
      state: 'candidate',
      publication: null,
      approval: null,
    })),
  }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply))
  const client = createPublicationClient({ request } as unknown as HttpTransport)
  expect((await client.read('source', 'candidate')).rings).toHaveLength(3)
  await client.change('source', 'candidate', {
    operationId,
    expectedRevision: 3,
    input: { action: 'validate', ring: 'test' },
  })
  expect(request.mock.calls[1]![0].path).toBe('/api/v1/software-sources/{source}/candidates/{id}')
  reply = { ...(reply as object), id: 'other' }
  await expect(client.read('source', 'candidate')).rejects.toThrow()
})

it.each(['source', 'version'] as const)(
  'binds %s admission write receipts to the exact operation',
  async (kind) => {
    let receivedOperation = '22222222-2222-4222-8222-222222222222'
    const request = vi.fn(async (o: RequestOptions<unknown>) => {
      const admission = {
        revision: 1,
        state: 'approved',
        operation: receivedOperation,
        actor: 'reviewer',
        evidence: [],
        at: 1,
        digest,
      }
      return o.decode(
        kind === 'source'
          ? {
              source: {
                id: 'private',
                revision: '1',
                kind: 'private',
                location: null,
                publishers: [],
              },
              snapshot: { id: 'private', revision: '1', sha256: digest },
              admission,
            }
          : { resource: 'app', version: '1', admission },
      )
    })
    const client = createAdmissionClient({ request } as unknown as HttpTransport)
    const body = {
      operationId,
      expectedRevision: 0,
      input: { action: 'approve' as const, evidence: [] },
    }
    const write = () =>
      kind === 'source'
        ? client.changeSource('private', '1', body)
        : client.changeVersion('app', '1', body)
    await expect(write()).rejects.toThrow()
    receivedOperation = operationId
    expect((await write()).admission.operation).toBe(operationId)
  },
)
