import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createMaterialsClient } from './materials'
import { material } from './materials-model'
import { requestTarget } from './requests-model'
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222',
  envelope = { contract: 'security-v1', tenantId: id, source: 'mock' }
it('rejects contradictory platform prerequisites, raw secrets and Bootstrap Token access actions', () => {
  const value = {
    device: 'device-02',
    kind: 'bootstrap_token',
    revision: 1,
    platform: 'macos',
    state: 'observed',
    evaluatedAt: 100,
    source: { registrationId: id, generation: 1, source: 'mdm.apple' },
    prerequisites: { status: 'eligible', reasons: [] },
    actions: ['reescrow'],
    details: {
      supported: true,
      supervised: true,
      ade: true,
      deviceChannel: true,
      awaitingConfiguration: false,
      escrow: 'absent',
    },
  }
  expect(material(value).kind).toBe('bootstrap_token')
  expect(() =>
    material({
      ...value,
      state: 'unknown',
      source: null,
      prerequisites: { status: 'unknown', reasons: ['source_changed'] },
      actions: [],
    }),
  ).toThrow()
  expect(() => material({ ...value, actions: ['reveal'] })).toThrow()
  expect(() => material({ ...value, platform: 'windows' })).toThrow()
  expect(() => material({ ...value, details: { ...value.details, supervised: false } })).toThrow()
  expect(() =>
    material({ ...value, details: { ...value.details, secret: 'SYNTHETIC leak' } }),
  ).toThrow()
  expect(() =>
    requestTarget({
      kind: 'material_access',
      device: 'device-02',
      material: 'bootstrap_token',
      materialRevision: 1,
      volume: null,
      action: 'reveal',
    }),
  ).toThrow()
})
it('binds disclosure to exact principal, session, device, material revision, volume, authorization and bounded lifetime', async () => {
  const target = {
      kind: 'material_access' as const,
      device: 'device-01',
      material: 'bitlocker' as const,
      materialRevision: 2,
      volume: 'os',
      action: 'reveal' as const,
    },
    body = { disclosureId: id, request: other, expectedRevision: 2 },
    binding = { principal: id, sessionId: other },
    good = {
      ...envelope,
      disclosureId: id,
      request: other,
      device: 'device-01',
      material: 'bitlocker',
      materialRevision: 2,
      volume: 'os',
      ...binding,
      issuedAt: 100,
      expiresAt: 130,
      secret: 'SYNTHETIC response only',
    }
  let reply: unknown = good
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply)),
    transport = { request } as unknown as HttpTransport,
    client = createMaterialsClient(transport, id, true)
  await expect(client.reveal(target, body, binding)).resolves.toMatchObject({ expiresAt: 130 })
  expect(request.mock.lastCall![0]).toMatchObject({
    method: 'POST',
    pathParams: { device: 'device-01', kind: 'bitlocker' },
    body,
  })
  for (const invalid of [
    { principal: other },
    { sessionId: id },
    { device: 'device-02' },
    { materialRevision: 3 },
    { volume: 'data' },
    { request: id },
    { disclosureId: other },
    { expiresAt: 131 },
    { tenantId: other },
    { unrelatedSecret: 'SYNTHETIC unexpected' },
  ]) {
    reply = { ...good, ...invalid }
    await expect(client.reveal(target, body, binding)).rejects.toThrow()
  }
  reply = good
  await expect(
    createMaterialsClient(transport, id, false).reveal(target, body, binding),
  ).rejects.toThrow()
  expect(JSON.stringify(request.mock.calls.map((call) => call[0].body))).not.toContain('SYNTHETIC')
})
