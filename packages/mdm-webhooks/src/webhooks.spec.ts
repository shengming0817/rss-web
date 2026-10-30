import { expect, it, vi } from 'vitest'
import {
  createWebhooks,
  materialIntent,
  validateMaterialInput,
  validatePresentation,
  validateSettings,
} from './index'
import type { Material, MaterialInput, Settings, Subscription, WebhooksPort } from './index'
const id = '11111111-1111-4111-8111-111111111111',
  event = '22222222-2222-4222-8222-222222222222',
  operationId = '33333333-3333-4333-8333-333333333333',
  replayId = '44444444-4444-4444-8444-444444444444'
const settings: Settings = {
  presentation: { name: 'Endpoint events', vendor: { false: false, zero: 0, nested: ['retain'] } },
  endpoint: 'https://receiver.example/events',
  eventTypes: ['device.registered'],
  selection: { kind: 'devices', ids: ['device-a'] },
  keyReference: 'signing',
  networkReference: 'network',
}
const subscription: Subscription = {
  id,
  revision: 5,
  targetVersion: 2,
  enabled: true,
  deleted: false,
  settings,
}
const input: MaterialInput = {
  reference: 'signing',
  expectedRevision: 4,
  configurationSha256: 'a'.repeat(64),
  endpoint: 'https://receiver.example/confirm',
  networkReference: 'network',
  source: { kind: 'generate' },
}
const material: Material = {
  operationId,
  reference: 'signing',
  revision: 5,
  configurationSha256: input.configurationSha256,
  keyDigest: 'b'.repeat(64),
  challenge: 'public-challenge',
  confirmed: false,
  revoked: false,
  endpoint: input.endpoint,
  networkReference: 'network',
  attemptedAt: null,
  confirmedAt: null,
  failureReason: null,
}
function port(methods: Partial<WebhooksPort>): WebhooksPort {
  return methods as WebhooksPort
}

it('preserves the whole bounded descriptive document and rejects ambiguous endpoints and target sets', () => {
  validateSettings(settings)
  expect(settings.presentation['vendor']).toEqual({ false: false, zero: 0, nested: ['retain'] })
  for (const endpoint of [
    'http://receiver.example',
    'https://user:password@receiver.example',
    'https://receiver.example?secret=1',
    'https://receiver.example/#fragment',
  ])
    expect(() => validateSettings({ ...settings, endpoint })).toThrow()
  expect(() =>
    validateSettings({ ...settings, selection: { kind: 'devices', ids: ['same', 'same'] } }),
  ).toThrow()
  expect(() =>
    validateSettings({
      ...settings,
      eventTypes: ['webhook.test'] as unknown as Settings['eventTypes'],
    }),
  ).toThrow()
  expect(() => validatePresentation({ name: 'valid', vendor: '界'.repeat(22000) })).toThrow()
  const nested: Record<string, unknown> = { name: 'valid' }
  nested['vendor'] = nested
  expect(() => validatePresentation(nested)).toThrow()
})
it('retains a frozen original CAS operation without automatically replaying an unknown write', async () => {
  const change = vi
      .fn<WebhooksPort['change']>()
      .mockRejectedValue({ code: 'operation_unknown', status: 503 }),
    core = createWebhooks(port({ change })),
    request = {
      operationId,
      expectedRevision: 4,
      input: {
        kind: 'put' as const,
        value: { ...settings, presentation: { ...settings.presentation } },
      },
    }
  await expect(core.change(id, request)).rejects.toEqual({ code: 'operation_unknown', status: 503 })
  request.input.value.presentation = { name: 'Edited elsewhere' }
  expect(change).toHaveBeenCalledTimes(1)
  expect(change.mock.calls[0]![1].input).toEqual({ kind: 'put', value: settings })
  expect(Object.isFrozen(change.mock.calls[0]![1].input)).toBe(true)
})
it('checks subscription identity and CAS independently of delivery target version', async () => {
  const change = vi.fn<WebhooksPort['change']>().mockResolvedValue(subscription),
    core = createWebhooks(port({ change }))
  expect(
    (
      await core.change(id, {
        operationId,
        expectedRevision: 4,
        input: { kind: 'put', value: settings },
      })
    ).targetVersion,
  ).toBe(2)
  change.mockResolvedValue({ ...subscription, id: replayId })
  await expect(
    core.change(id, { operationId, expectedRevision: 4, input: { kind: 'delete' } }),
  ).rejects.toThrow()
  await expect(
    core.change(id, { operationId, expectedRevision: 0, input: { kind: 'enabled', value: true } }),
  ).rejects.toThrow()
})
it('requires replay to create a new delivery of the exact same event from the exact source', async () => {
  const replay = vi
      .fn<WebhooksPort['replay']>()
      .mockResolvedValue({ id: replayId, eventId: event, sourceDelivery: id }),
    core = createWebhooks(port({ replay }))
  expect((await core.replay({ id, eventId: event }, operationId)).id).toBe(replayId)
  replay.mockResolvedValue({ id, eventId: event, sourceDelivery: id })
  await expect(core.replay({ id, eventId: event }, operationId)).rejects.toThrow()
  replay.mockResolvedValue({ id: replayId, eventId: operationId, sourceDelivery: id })
  await expect(core.replay({ id, eventId: event }, operationId)).rejects.toThrow()
})
it('redrives the original delivery with its positive recovery version and validates the real receipt', async () => {
  const redrive = vi
      .fn<WebhooksPort['redrive']>()
      .mockResolvedValue({ id, operationId, status: 'redriven', recoveryVersion: 8 }),
    core = createWebhooks(port({ redrive }))
  expect((await core.redrive({ id, recoveryVersion: 7 }, operationId)).id).toBe(id)
  expect(redrive).toHaveBeenCalledWith(id, operationId, 7)
  await expect(core.redrive({ id, recoveryVersion: 0 }, operationId)).rejects.toThrow()
  redrive.mockResolvedValue({ id, operationId: replayId, status: 'redriven', recoveryVersion: 8 })
  await expect(core.redrive({ id, recoveryVersion: 7 }, operationId)).rejects.toThrow()
})
it('retains only public material intent after imported secret submission', () => {
  const secret = 'whsec_' + btoa('s'.repeat(32)),
    original: MaterialInput = { ...input, source: { kind: 'import', secret } },
    pending = materialIntent(original)
  expect(pending.source).toBe('import')
  expect(JSON.stringify(pending)).not.toContain(secret)
  expect(Object.isFrozen(pending)).toBe(true)
  expect(() =>
    validateMaterialInput({
      ...input,
      source: { kind: 'import', secret: 'whsec_' + btoa('short') },
    }),
  ).toThrow()
  expect(() =>
    validateMaterialInput({
      ...input,
      source: { kind: 'import', secret: 'whsec_' + btoa('s'.repeat(65)) },
    }),
  ).toThrow()
  expect(() => validateMaterialInput({ ...input, configurationSha256: 'not-a-digest' })).toThrow()
})
it('binds a prepared material receipt to its original operation, configuration and head revision', async () => {
  const prepare = vi.fn<WebhooksPort['prepare']>().mockResolvedValue(material),
    core = createWebhooks(port({ prepare }))
  expect((await core.prepare(operationId, input)).confirmed).toBe(false)
  for (const override of [
    { operationId: replayId },
    { reference: 'another' },
    { revision: 6 },
    { configurationSha256: 'c'.repeat(64) },
  ]) {
    prepare.mockResolvedValue({ ...material, ...override })
    await expect(core.prepare(operationId, input)).rejects.toThrow()
  }
  const materialOperation = vi
    .fn<WebhooksPort['materialOperation']>()
    .mockResolvedValue({ ...material, operationId: replayId })
  await expect(
    createWebhooks(port({ materialOperation })).materialOperation(operationId),
  ).rejects.toThrow()
})
it('separates head CAS from material revision and does not infer fallback after active-key revocation', async () => {
  const transition = vi.fn<WebhooksPort['transition']>().mockResolvedValue({
      operationId,
      reference: 'signing',
      revision: 9,
      activeRevision: 3,
      retiringRevision: null,
    }),
    core = createWebhooks(port({ transition }))
  expect(
    (
      await core.transition(operationId, {
        reference: 'signing',
        expectedRevision: 8,
        action: { kind: 'revoke', materialRevision: 3 },
      })
    ).activeRevision,
  ).toBe(3)
  expect(
    (
      await core.transition(operationId, {
        reference: 'signing',
        expectedRevision: 8,
        action: { kind: 'activate', materialRevision: 3 },
      })
    ).revision,
  ).toBe(9)
  await expect(
    core.transition(operationId, {
      reference: 'signing',
      expectedRevision: 8,
      action: { kind: 'activate', materialRevision: 5 },
    }),
  ).rejects.toThrow()
})
