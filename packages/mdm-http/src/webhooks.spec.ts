import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createWebhooks, eventTypes } from '@rss/mdm-webhooks'
import type { MaterialInput, Settings } from '@rss/mdm-webhooks'
import { createWebhooksAdapter } from './webhooks'
const id = '11111111-1111-4111-8111-111111111111',
  operationId = '22222222-2222-4222-8222-222222222222',
  eventId = '33333333-3333-4333-8333-333333333333',
  replay = '44444444-4444-4444-8444-444444444444'
const settings: Settings = {
  presentation: { name: 'Webhook', vendor: { zero: 0, flag: false } },
  endpoint: 'https://receiver.example/events',
  eventTypes: ['device.registered'],
  selection: { kind: 'devices', ids: ['device'] },
  keyReference: 'key',
  networkReference: 'network',
}
const subscription = { id, revision: 5, targetVersion: 2, enabled: false, deleted: false, settings }
const delivery = {
  id,
  eventId,
  subscriptionId: id,
  targetVersion: 2,
  sourceDelivery: null,
  recoveryVersion: 7,
  redriveWindowOpen: true,
  attempts: 3,
  status: 'dead_letter',
  transportObservation: 'unknown',
  failureStage: 'transport',
  failureReason: null,
}
const input: MaterialInput = {
  reference: 'key',
  expectedRevision: 4,
  configurationSha256: 'a'.repeat(64),
  endpoint: 'https://receiver.example/confirm',
  networkReference: 'network',
  source: { kind: 'generate' },
}
const material = {
  operationId,
  reference: 'key',
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
const receipt = {
  operationId,
  reference: 'key',
  revision: 6,
  activeRevision: 5,
  retiringRevision: 3,
}
function fixture(reply: unknown) {
  const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(reply)),
    adapter = createWebhooksAdapter({ request } as unknown as HttpTransport)
  return { request, adapter, core: createWebhooks(adapter) }
}
it('keeps directory omissions distinct from full subscription detail and preserves current extensions on CAS writes', async () => {
  const page = fixture({ items: [{ id, enabled: false }], nextCursor: null })
  expect(
    (await page.core.subscriptions({ fields: ['id', 'enabled'], filter: 'deleted==false' }))
      .items[0],
  ).toEqual({ id, enabled: false })
  const f = fixture(subscription)
  expect((await f.core.subscription(id)).settings.presentation['vendor']).toEqual({
    zero: 0,
    flag: false,
  })
  await f.core.change(id, {
    operationId,
    expectedRevision: 4,
    input: { kind: 'put', value: settings },
  })
  expect(f.request.mock.lastCall![0]).toMatchObject({
    method: 'PUT',
    path: '/api/v1/webhooks/subscriptions/{id}',
    pathParams: { id },
    body: { operationId, expectedRevision: 4, change: { kind: 'put', value: settings } },
    successStatus: 200,
  })
  await expect(
    fixture({ ...subscription, secret: 'private' }).core.subscription(id),
  ).rejects.toBeDefined()
})
it('uses catalog and test receipt identities independently of delivery state', async () => {
  expect(
    (await fixture({ version: 1, items: [...eventTypes] }).core.eventTypes()).items,
  ).not.toContain('webhook.test')
  const f = fixture({ id, eventId })
  expect(await f.core.test(id, operationId, 'device')).toEqual({ id, eventId })
  expect(f.request.mock.lastCall![0]).toMatchObject({
    path: '/api/v1/webhooks/subscriptions/{id}/test',
    body: { operationId, deviceId: 'device' },
    successStatus: 200,
  })
})
it('requires the exact full delivery page and does not fabricate fields in projected directories', async () => {
  const f = fixture({ items: [delivery], nextCursor: null })
  expect((await f.core.delivery(id)).transportObservation).toBe('unknown')
  expect(f.request.mock.lastCall![0].path).toBe('/api/v1/webhooks/deliveries/{id}')
  const projected = fixture({ items: [{ id, status: 'pending' }], nextCursor: null })
  expect(
    (await projected.core.deliveries({ fields: ['id', 'status'] })).items[0],
  ).not.toHaveProperty('transportObservation')
  await expect(projected.core.delivery(id)).rejects.toBeDefined()
  await expect(
    fixture({
      items: [{ ...delivery, payload: { secret: 'private' } }],
      nextCursor: null,
    }).core.delivery(id),
  ).rejects.toBeDefined()
  await expect(
    fixture({ items: [{ ...delivery, status: 'maybe' }], nextCursor: null }).core.delivery(id),
  ).rejects.toBeDefined()
})
it('binds replay and redrive to their different identities, version owner and formal bodies', async () => {
  const replayed = fixture({ id: replay, eventId, sourceDelivery: id })
  expect((await replayed.core.replay({ id, eventId }, operationId)).id).toBe(replay)
  expect(replayed.request.mock.lastCall![0]).toMatchObject({
    path: '/api/v1/webhooks/deliveries/{id}/replay',
    body: { operationId },
  })
  const redriven = fixture({ id, operationId, status: 'redriven', recoveryVersion: 8 })
  expect((await redriven.core.redrive({ id, recoveryVersion: 7 }, operationId)).id).toBe(id)
  expect(redriven.request.mock.lastCall![0]).toMatchObject({
    path: '/api/v1/webhooks/deliveries/{id}/redrive',
    body: { operationId, expectedVersion: 7 },
  })
  await expect(
    fixture({ id, operationId: replay, status: 'redriven', recoveryVersion: 8 }).core.redrive(
      { id, recoveryVersion: 7 },
      operationId,
    ),
  ).rejects.toBeDefined()
})
it('reads tenant health as source and delivery Outbox aggregates without leaking unrelated root data', async () => {
  const f = fixture({
    outbox: [
      { domain: 'mdm-webhook-source', status: 'pending', count: 7 },
      { domain: 'mdm-webhook-delivery', status: 'published', count: 2 },
    ],
  })
  expect((await f.core.health()).outbox).toHaveLength(2)
  expect(f.request.mock.lastCall![0].path).toBe('/api/v1/webhooks/health')
  await expect(
    fixture({ outbox: [{ domain: 'receiver-health', status: 'pending', count: 1 }] }).core.health(),
  ).rejects.toBeDefined()
})
it('uses material-specific header idempotency, safe original lookup and separate head/material revisions', async () => {
  const f = fixture(material)
  expect((await f.core.prepare(operationId, input)).confirmed).toBe(false)
  expect(f.request.mock.lastCall![0]).toMatchObject({
    path: '/api/v1/webhooks/materials',
    headers: { 'Idempotency-Key': operationId },
    body: input,
    successStatus: 200,
  })
  expect(f.request.mock.lastCall![0].body).not.toHaveProperty('operationId')
  await f.core.materialOperation(operationId)
  expect(f.request.mock.lastCall![0]).toMatchObject({
    path: '/api/v1/webhooks/materials/operations/{id}',
    pathParams: { id: operationId },
  })
  const changed = fixture(receipt)
  await changed.core.transition(operationId, {
    reference: 'key',
    expectedRevision: 5,
    action: { kind: 'activate', materialRevision: 5 },
  })
  expect(changed.request.mock.lastCall![0]).toMatchObject({
    path: '/api/v1/webhooks/materials/transitions',
    headers: { 'Idempotency-Key': operationId },
    body: {
      reference: 'key',
      expectedRevision: 5,
      action: { kind: 'activate', materialRevision: 5 },
    },
  })
  expect(await changed.core.materialOperation(operationId)).toEqual(receipt)
  const directory = fixture({
    configurationSha256: input.configurationSha256,
    keys: {
      heads: [{ reference: 'key', revision: 6, activeRevision: 5, retiringRevision: 3 }],
      materials: [material],
    },
  })
  expect((await directory.core.materials()).heads[0]!.revision).toBe(6)
  expect(directory.request.mock.lastCall![0].path).toBe('/api/v1/webhooks/materials')
  await expect(
    fixture({ ...material, secret: 'private' }).core.materialOperation(operationId),
  ).rejects.toBeDefined()
})
