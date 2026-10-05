import { createHash, randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import type { DemoRequest } from '../scenario'
import { createResourceDemo } from '../policies/resources'
export const publisher = '22222222-2222-4222-8222-222222222222'
export const approver = '33333333-3333-4333-8333-333333333333'
export const hash = (value: unknown) => [
  ...createHash('sha256').update(JSON.stringify(value)).digest(),
]
export function request(
  path: string,
  body?: unknown,
  principalId = publisher,
  query = new URLSearchParams(),
): DemoRequest {
  return {
    path,
    method: body === undefined ? 'GET' : 'POST',
    body,
    query,
    actor: { principalId, sessionId: '44444444-4444-4444-8444-444444444444' },
    headers: {},
  }
}
export const operation = <T>(input: T, expectedRevision: number) => ({
  operationId: randomUUID(),
  expectedRevision,
  input,
})
/** Shared test setup through the actual Resource HTTP handler, never a UI fixture. */
export function softwareResource(packageName = 'Example.App') {
  const resources = createResourceDemo(() => false)
  const bytes = new Uint8Array([1, 2, 3]).buffer
  const digest = [...createHash('sha256').update(new Uint8Array(bytes)).digest()]
  const command = {
    runAs: 'system',
    arguments: [],
    environment: {},
    timeoutSeconds: 60,
    outputBytes: 1024,
    exitCodes: { success: [0], reboot: [3010] },
  }
  const definition = {
    source: { id: 'private', revision: '1', sha256: hash('source') },
    package: packageName,
    version: '1.0',
    artifacts: { installer: { reference: 'installer', origin: null, length: 3, sha256: digest } },
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
        version: '1.0',
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
  expect(
    resources.handle(
      request(
        '/api/v1/resources/app/content',
        bytes,
        publisher,
        new URLSearchParams({
          version: '1',
          platform: 'windows',
          architecture: 'x86_64',
          variant: 'main',
        }),
      ),
      'normal',
    )?.status,
  ).toBe(201)
  return { resources, definition, bytes }
}
