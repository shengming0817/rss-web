import { createHash, randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import type { DemoRequest } from '../scenario'
import { createResourceDemo } from '../policies/resources'
import { createAdmissionDemo } from './admission'
const actor = { principalId: randomUUID(), sessionId: randomUUID() }
function request(path: string, body?: unknown, query = new URLSearchParams()): DemoRequest {
  return { path, method: body === undefined ? 'GET' : 'POST', body, query, actor, headers: {} }
}
const operation = (input: unknown, expectedRevision: number) => ({
  operationId: randomUUID(),
  expectedRevision,
  input,
})
it('approves enterprise software without publication, verifies all content, fences CAS and withdraws without changing resources', () => {
  const resources = createResourceDemo(() => false),
    catalog = createAdmissionDemo(resources)
  const sourcePath = '/api/v1/software/sources/private/revisions/1'
  const writeSource = (input: unknown, revision: number) =>
    catalog.handle(request(sourcePath, operation(input, revision)), 'normal')!
  expect(
    writeSource(
      {
        action: 'register',
        definition: {
          id: 'private',
          revision: '1',
          kind: 'private',
          location: null,
          publishers: [],
        },
      },
      0,
    ).status,
  ).toBe(200)
  const approved = writeSource({ action: 'approve', evidence: ['reviewed'] }, 1)
  const source = (approved.body as { snapshot: unknown }).snapshot
  const bytes = new Uint8Array([1, 2, 3]).buffer,
    digest = [...createHash('sha256').update(new Uint8Array(bytes)).digest()]
  const command = {
    runAs: 'system',
    arguments: [],
    environment: {},
    timeoutSeconds: 60,
    outputBytes: 1024,
    exitCodes: { success: [0], reboot: [3010] },
  }
  const definition = {
    source,
    package: 'app',
    version: '1',
    artifacts: {
      installer: { reference: 'content', origin: null, length: 3, sha256: digest },
      detector: { reference: 'detector', origin: null, length: 3, sha256: digest },
    },
    reboot: 'report',
    downgrade: 'deny',
    dependencies: [],
    provenance: { kind: 'private' },
    signatures: [],
    export: { kind: 'disabled' },
    behavior: {
      kind: 'msi',
      installer: 'installer',
      scope: 'system',
      install: command,
      upgradeInvocation: command,
      upgrade: 'in_place',
      uninstall: null,
      detect: {
        kind: 'msi_product',
        productCode: '{11111111-1111-4111-8111-111111111111}',
        version: '1',
      },
    },
  }
  expect(
    resources.handle(
      request('/api/v1/resources/app', operation({ action: 'create', kind: 'software' }, 0)),
      'normal',
    )?.status,
  ).toBe(200)
  expect(
    resources.handle(
      request(
        '/api/v1/resources/app',
        operation(
          {
            action: 'version',
            version: '1',
            kind: 'software',
            variants: [
              {
                platform: 'windows',
                architecture: 'x86_64',
                key: 'main',
                declaration: { kind: 'software', definition },
              },
            ],
          },
          1,
        ),
      ),
      'normal',
    )?.status,
  ).toBe(200)
  const versionPath = '/api/v1/software/resources/app/versions/1',
    approve = operation({ action: 'approve', evidence: ['tested'] }, 0)
  expect(catalog.handle(request(versionPath, approve), 'normal')?.status).toBe(409)
  const query = new URLSearchParams({
    version: '1',
    platform: 'windows',
    architecture: 'x86_64',
    variant: 'main',
  })
  expect(
    resources.handle(request('/api/v1/resources/app/content', bytes, query), 'normal')?.status,
  ).toBe(201)
  expect(catalog.handle(request(versionPath, approve), 'normal')?.status).toBe(409)
  query.set('artifact', 'detector')
  expect(
    resources.handle(request('/api/v1/resources/app/content', bytes, query), 'normal')?.status,
  ).toBe(201)
  const admitted = catalog.handle(request(versionPath, approve), 'normal')!
  expect(admitted.status).toBe(200)
  expect(catalog.handle(request(versionPath, approve), 'normal')).toEqual(admitted)
  expect(
    catalog.handle(
      request(versionPath, { ...approve, input: { action: 'withdraw', evidence: ['changed'] } }),
      'normal',
    )?.status,
  ).toBe(409)
  expect(catalog.isAdmitted('app', '1', approve.operationId)).toBe(true)
  expect(
    catalog.handle(
      request(versionPath, operation({ action: 'withdraw', evidence: ['retired'] }, 1)),
      'normal',
    )?.status,
  ).toBe(200)
  expect(catalog.isAdmitted('app', '1', approve.operationId)).toBe(false)
  expect(resources.read('app')?.versions[0]?.state).toBe('frozen')
  catalog.reset()
  expect(catalog.handle(request(sourcePath), 'normal')?.status).toBe(404)
})
