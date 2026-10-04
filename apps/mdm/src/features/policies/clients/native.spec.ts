import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createNativeClient, decodeNativeOperation } from './native'
const id = '11111111-1111-4111-8111-111111111111'
const requestId = '22222222-2222-4222-8222-222222222222'
const base = {
  operationId: id,
  commandId: id,
  revision: 1,
  task: { kind: 'profile_install', enabled: true },
  deadline: 4102444800,
  authorization: 'approved',
  commandStatus: 'received',
}
it('retains Apple acknowledgement separately from effect without inventing receiptAccepted', () => {
  const value = {
    ...base,
    observation: {
      protocol: 'mdm.apple',
      observationScope: 'profile_presence',
      progress: 'succeeded',
      result: 'unknown',
      effect: 'unknown',
    },
  }
  expect(decodeNativeOperation(value, id)).toEqual(value)
  expect(() => decodeNativeOperation({ ...value, operationId: requestId }, id)).toThrow()
})
it('decodes Windows attempt, native status and observation quality without folding them into command status', () => {
  const value = {
    ...base,
    task: { kind: 'state_verify', field: 'model', expectedValue: 'ThinkPad' },
    observation: {
      protocol: 'mdm.windows',
      receiptAccepted: true,
      progress: 'succeeded',
      result: 'matched',
      effect: 'verified_present',
      writeStatus: 200,
      attemptId: requestId,
      attempt: 2,
      nativeStatus: 200,
      value: 'ThinkPad',
      quality: 'success',
      receivedAt: 1780000000,
    },
  }
  expect(decodeNativeOperation(value, id)).toEqual(value)
  expect(() =>
    decodeNativeOperation(
      { ...value, observation: { ...value.observation, quality: 'compliant' } },
      id,
    ),
  ).toThrow()
})
it('uses native requestId and revision for approval/cancel, not script operation bodies', async () => {
  let reply: unknown = { operationId: id, commandId: id, revision: 1, accepted: true }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply))
  const client = createNativeClient({ request } as unknown as HttpTransport)
  await client.create('device-01', {
    operationId: id,
    task: { kind: 'profile_install', enabled: true },
    deadline: 4102444800,
  })
  expect(request.mock.calls[0]![0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/devices/{device}/operations',
    pathParams: { device: 'device-01' },
    successStatus: 202,
  })
  reply = { operationId: id, revision: 2 }
  await client.approve('device-01', id, { requestId, expectedRevision: 1 })
  expect(request.mock.calls[1]![0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/devices/{device}/operations/{operation}/approve',
    body: { requestId, expectedRevision: 1 },
    successStatus: 200,
  })
  await client.cancel('device-01', id, { requestId, expectedRevision: 2 })
  expect(request.mock.calls[2]![0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/devices/{device}/operations/{operation}/cancel',
    body: { requestId, expectedRevision: 2 },
    successStatus: 200,
  })
})
