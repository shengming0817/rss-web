import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createRecoveryCredentials, type Subject } from '@rss/mdm-recovery-credentials'
import { createRecoveryCredentialsAdapter } from './recovery-credentials'
const id = '11111111-1111-4111-8111-111111111111',
  operationId = '22222222-2222-4222-8222-222222222222',
  custody = '44444444-4444-4444-8444-444444444444',
  device = 'device-a'
const target = { device, id, version: 2 }
const material = (subject: Subject = { kind: 'recovery_lock' }) => ({
  id,
  version: 2,
  binding: { device, subject },
  current: true,
  validity: 'unverified',
  escrowed: true,
  operation: operationId,
  createdAt: 1700000000,
  invalidatedAt: null,
})
const configuration = () => ({
  enabled: true,
  revision: 6,
  custodyId: custody,
  custodyEpoch: 8,
  recipientId: 'escrow-recipient',
  recipientCertificate: 'public certificate',
  materialRevision: 12,
})
const operation = () => ({
  owner: 'recovery',
  operationId,
  commandId: operationId,
  revision: 1,
  inputVersion: 'recovery-credential/v1',
  deadline: 1800000000,
  task: { platform: 'macos', kind: 'command', name: 'SecurityInfo', objects: [] },
  target: { kind: 'device' },
  commandStatus: 'received',
  authorization: { state: 'authorized' },
  reauthorization: { state: 'not_applicable' },
  dispatchFailure: null,
  observation: {
    protocol: 'mdm.apple',
    observationScope: 'native_command',
    progress: 'received',
    effect: 'unverified',
    result: null,
    fields: null,
    error: null,
    receipts: [
      {
        phase: 'execute',
        state: 'sent',
        receivedAt: null,
        accepted: false,
        fields: null,
        outcome: null,
      },
    ],
  },
})
function fixture(value: unknown | ((options: RequestOptions<unknown>) => unknown)) {
  const request = vi.fn(async (options: RequestOptions<unknown>) =>
      options.decode(typeof value === 'function' ? value(options) : value),
    ),
    adapter = createRecoveryCredentialsAdapter({ request } as unknown as HttpTransport)
  return { request, adapter, core: createRecoveryCredentials(adapter) }
}
it('uses composite material identity with projected directories and strict exact detail', async () => {
  const f = fixture({
    items: [{ id, version: 2, escrowed: false, validity: 'unknown' }],
    nextCursor: null,
  })
  expect(
    (await f.core.list(device, { fields: ['id', 'version', 'escrowed', 'validity'] })).items,
  ).toEqual([{ id, version: 2, escrowed: false, validity: 'unknown' }])
  const detail = fixture({ items: [material()], nextCursor: null })
  expect(await detail.core.material(target)).toEqual(material())
  expect(detail.request.mock.calls[0]![0].query).toMatchObject({
    filter: `(id=='${id}');(version=='2')`,
    limit: 1,
  })
  await expect(
    fixture({ items: [{ ...material(), version: 3 }], nextCursor: null }).core.material(target),
  ).rejects.toBeDefined()
})
it.each<Subject>([
  { kind: 'rss_login', binding: id, bindingGeneration: 2, sid: 'S-1-5-21-1-2-3-1001' },
  { kind: 'bitlocker', volume: 'volume-id', protector: id },
  { kind: 'local_administrator', sid: 'S-1-5-21-1-2-3-500' },
  { kind: 'filevault', custody, epoch: 8 },
  { kind: 'recovery_lock' },
  { kind: 'lock_pin', operation: operationId },
])('admits formal $kind identity without using display text', async (subject) => {
  expect(
    (await fixture({ items: [material(subject)], nextCursor: null }).core.material(target)).binding
      .subject,
  ).toEqual(subject)
})
it('keeps FileVault selection, collection CAS and custody link on their formal routes', async () => {
  const f = fixture(configuration())
  await f.core.configuration(device)
  expect(f.request.mock.calls[0]![0]).toMatchObject({
    method: 'GET',
  })
  await f.core.configure(device, {
    operationId,
    expectedRevision: 5,
    enabled: true,
    recipientId: 'escrow-recipient',
  })
  expect(f.request.mock.calls[1]![0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/devices/{device}/recovery-credentials/filevault/configuration',
    body: {
      operationId,
      expectedRevision: 5,
      enabled: true,
      recipientId: 'escrow-recipient',
    },
  })
  await f.core.link(device, operationId, 'device-b')
  expect(f.request.mock.calls[2]![0]).toMatchObject({
    path: '/api/v1/devices/{device}/recovery-credentials/filevault/link',
    body: { operationId, otherDevice: 'device-b' },
  })
  expect(configuration().revision).not.toBe(configuration().materialRevision)
})
it('reads ordinary secrets through the exact GET and carries the abort signal', async () => {
  const f = fixture((options: RequestOptions<unknown>) =>
      options.path.endsWith('/secret')
        ? { material: material(), secret: 'synthetic-secret' }
        : { items: [material()], nextCursor: null },
    ),
    controller = new AbortController()
  expect((await f.core.reveal(target, controller.signal)).secret).toBe('synthetic-secret')
  expect(f.request.mock.calls[0]![0]).toMatchObject({
    method: 'GET',
    path: '/api/v1/devices/{device}/recovery-credentials/{id}/versions/{version}/secret',
    pathParams: target,
    signal: controller.signal,
  })
})
it('accepts a DA material challenge without an invented expires_at and preserves exact operation coordinates', async () => {
  const login = material({
      kind: 'rss_login',
      binding: id,
      bindingGeneration: 2,
      sid: 'S-1-5-21-1-2-3-1001',
    }),
    f = fixture((options: RequestOptions<unknown>) =>
      options.path.endsWith('/step-up')
        ? {
            id: operationId,
            options: {
              publicKey: {
                challenge: 'AQID',
                rpId: 'mdm.example.test',
                allowCredentials: [],
                userVerification: 'required',
              },
            },
          }
        : options.path.endsWith('/secret')
          ? { material: login, secret: 'A'.repeat(43) }
          : { items: [login], nextCursor: null },
    )
  const input = { operationId, target },
    challenge = await f.core.beginLoginDisclosure(input)
  expect(challenge).toEqual({
    id: operationId,
    publicKey: {
      challenge: 'AQID',
      rpId: 'mdm.example.test',
      allowCredentials: [],
      userVerification: 'required',
    },
  })
  expect(challenge).not.toHaveProperty('expiresAt')
  expect(f.request.mock.calls[0]![0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/devices/{device}/device-access/materials/{id}/versions/{version}/step-up',
    pathParams: target,
    body: { operationId },
  })
  await f.core.revealLogin(input)
  expect(f.request.mock.calls[1]![0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/devices/{device}/device-access/materials/{id}/versions/{version}/secret',
    body: { operationId },
  })
  expect(
    f.request.mock.calls.every(
      (call) =>
        !Object.keys(call[0].headers ?? {}).some((key) => /proof|purpose|authorization/i.test(key)),
    ),
  ).toBe(true)
})
it('uses material-type-specific revocation without manufacturing an idempotency operation', async () => {
  const f = fixture({ ...material(), validity: 'revoked' })
  await f.core.revoke(target)
  expect(f.request.mock.calls[0]![0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/devices/{device}/recovery-credentials/{id}/versions/{version}/revoke',
    pathParams: target,
  })
  expect(f.request.mock.calls[0]![0]).not.toHaveProperty('body')
  expect(f.request.mock.calls[0]![0].headers).not.toHaveProperty('Idempotency-Key')
})
it('submits rotation acceptance separately from the secret-free original intent and device facts', async () => {
  const f = fixture({ operationId, commandId: operationId, revision: 1, accepted: true })
  await f.core.create(
    {
      device,
      operationId,
      deadline: 1800000000,
      action: { kind: 'rotate_filevault', expectedRevision: 12 },
    },
    'synthetic-unlock',
  )
  expect(f.request.mock.calls[0]![0]).toMatchObject({
    successStatus: 202,
    body: {
      operationId,
      deadline: 1800000000,
      action: {
        kind: 'rotate_filevault',
        expectedRevision: 12,
        unlockPassword: 'synthetic-unlock',
      },
    },
  })
})
it('projects native operation facts without claiming device verification', async () => {
  const f = fixture(operation()),
    found = await f.core.operation(device, operationId)
  expect(found).toMatchObject({
    commandStatus: 'received',
    authorization: 'authorized',
    observation: { scope: 'native_command', effect: 'unverified', receipts: [{ accepted: false }] },
  })
  const profile = fixture({
    ...operation(),
    task: { platform: 'macos', kind: 'install_profile', name: 'Escrow', objects: [] },
    observation: {
      protocol: 'mdm.apple',
      observationScope: 'profile_presence',
      progress: 'unknown',
      effect: 'unknown',
      result: 'unknown',
      receivedAt: null,
      receipts: [],
    },
  })
  expect((await profile.core.operation(device, operationId)).observation).toMatchObject({
    scope: 'profile_presence',
    effect: 'unknown',
    result: 'unknown',
  })
  await expect(
    fixture({ ...operation(), inputVersion: 'software/v1' }).core.operation(device, operationId),
  ).rejects.toBeDefined()
})
