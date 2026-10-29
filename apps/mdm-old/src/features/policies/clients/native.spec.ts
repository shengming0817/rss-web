import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import {
  createNativeClient,
  decodeNativeOperation,
  deviceControlAction,
  controlKind,
} from './native'
const id = '11111111-1111-4111-8111-111111111111'
const read = {
  operationId: id,
  commandId: id,
  revision: 1,
  task: {
    platform: 'windows',
    kind: 'sync_ml',
    name: 'SyncML',
    objects: ['./Device/Vendor/MSFT/Reboot/RebootNow'],
  },
  target: { kind: 'device' },
  inputVersion: 'device-control-v1',
  deadline: 4102444800,
  dispatchFailure: null,
  authorization: { state: 'authorized' },
  reauthorization: { state: 'unavailable', reason: 'already_received' },
  commandStatus: 'queued',
  agentInstallation: null,
  observation: {
    protocol: 'syncml',
    observationScope: 'native_objects',
    receipts: [],
    progress: 'queued',
    effect: 'waiting',
  },
}
it('decodes current command facts without accepting retired authorization or task DTOs', () => {
  expect(decodeNativeOperation(read, id)).toMatchObject({
    authorization: { state: 'authorized' },
    reauthorization: { state: 'unavailable', reason: 'already_received' },
    task: { platform: 'windows' },
  })
  for (const bad of [
    { ...read, authorization: 'approved' },
    { ...read, task: { kind: 'profile_install', enabled: true } },
    { ...read, task: { platform: 'windows', request: { kind: 'sync_ml', request: {} } } },
    { ...read, approval: {} },
    { ...read, commandId: crypto.randomUUID() },
  ])
    expect(() => decodeNativeOperation(bad, id)).toThrow()
})
it('binds dangerous control to exact confirmation and rejects invalid PINs', () => {
  expect(deviceControlAction({ kind: 'restart' })).toEqual({ kind: 'restart' })
  const action = {
    kind: 'lock',
    confirmed: true,
    expectedRegistrationId: id,
    expectedGeneration: 1,
    pin: '123456',
  }
  expect(deviceControlAction(action)).toEqual(action)
  for (const bad of [
    { ...action, confirmed: false },
    { ...action, expectedGeneration: 0 },
    { ...action, pin: '12' },
    { kind: 'wipe' },
  ])
    expect(() => deviceControlAction(bad)).toThrow()
})
it('uses exact control and reauthorization routes with original CAS and never retries a lost response', async () => {
  let response: unknown = { operationId: id, commandId: id, revision: 1, accepted: true }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(response)),
    client = createNativeClient({ request } as unknown as HttpTransport)
  await client.create('d', { operationId: id, deadline: 4102444800, action: { kind: 'restart' } })
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    body: { action: { kind: 'restart' } },
    successStatus: 202,
  })
  response = { operationId: id, revision: 2 }
  const body = {
    requestId: id,
    expectedRevision: 1,
    confirmation: { confirmed: true as const, expectedRegistrationId: id, expectedGeneration: 1 },
  }
  await client.reauthorize('d', id, body)
  expect(request.mock.calls[1]?.[0]).toMatchObject({
    path: '/api/v1/devices/{device}/operations/{id}/reauthorize',
    body,
  })
  request.mockRejectedValueOnce(new Error('lost'))
  await expect(client.cancel('d', id, { requestId: id, expectedRevision: 2 })).rejects.toThrow(
    'lost',
  )
  expect(request).toHaveBeenCalledTimes(3)
})

it('identifies dangerous actions only from exact redacted task summaries, retaining generic tasks as generic', () => {
  expect(
    controlKind({ platform: 'macos', kind: 'command', name: 'EraseDevice', objects: [] }),
  ).toBe('wipe')
  expect(controlKind({ platform: 'macos', kind: 'command', name: 'DeviceLock', objects: [] })).toBe(
    'lock',
  )
  expect(
    controlKind({
      platform: 'windows',
      kind: 'sync_ml',
      name: 'SyncML',
      objects: ['./Device/Vendor/MSFT/RemoteWipe/doWipe'],
    }),
  ).toBe('wipe')
  expect(
    controlKind({
      platform: 'windows',
      kind: 'sync_ml',
      name: 'SyncML',
      objects: ['./Device/Vendor/MSFT/Reboot/RebootNow', 'other'],
    }),
  ).toBeNull()
})

it('decodes current authorization and eligibility independently and rejects old or malformed summaries', () => {
  const value = {
    ...read,
    authorization: { state: 'blocked', reason: 'registration_changed' },
    reauthorization: { state: 'unavailable', reason: 'registration_changed' },
  }
  expect(decodeNativeOperation(value, id)).toMatchObject({
    authorization: value.authorization,
    reauthorization: value.reauthorization,
  })
  expect(
    decodeNativeOperation(
      { ...read, reauthorization: { state: 'available', confirmationRequired: false } },
      id,
    ).reauthorization,
  ).toEqual({ state: 'available', confirmationRequired: false })
  for (const patch of [
    { authorization: 'authorized' },
    { authorization: { state: 'blocked', reason: 'unknown_reason' } },
    { authorization: { state: 'authorized', reason: 'source_invalid' } },
    { reauthorization: { state: 'available' } },
    { reauthorization: { state: 'unavailable', reason: 'unknown_reason' } },
    { reauthorization: { state: 'not_applicable', confirmationRequired: false } },
  ])
    expect(() => decodeNativeOperation({ ...read, ...patch }, id)).toThrow()
})
