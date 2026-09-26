import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createNativeDemo } from './native'
import { createDeviceDemo } from '../devices/state'
import { decodeNativeOperation } from '../../src/features/policies/clients/native'
import type { DemoRequest } from '../scenario'
it('keeps protocol observations distinct and rejects direct firewall execution', () => {
  const devices = createDeviceDemo(),
    native = createNativeDemo(devices)
  const actor = { principalId: randomUUID(), sessionId: randomUUID() }
  function request(path: string, body?: unknown): DemoRequest {
    return {
      path,
      body,
      method: body === undefined ? 'GET' : 'POST',
      actor,
      headers: {},
      query: new URLSearchParams(),
    }
  }
  for (const platform of ['windows', 'macos']) {
    const device = devices
      .facts()
      .find((d) => d.summary.platform === platform && d.summary.channels.includes('mdm'))!
    const operationId = randomUUID(),
      path = `/api/v2/devices/${device.summary.id}/operations`
    const task =
      platform === 'windows'
        ? { kind: 'state_verify', field: 'model', expectedValue: 'Synthetic' }
        : { kind: 'profile_install', enabled: true }
    expect(
      native.handle(request(path, { operationId, task, deadline: 4102444800 }), 'normal')?.status,
    ).toBe(202)
    const read = decodeNativeOperation(
      native.handle(request(`${path}/${operationId}`), 'normal')?.body,
      operationId,
    )
    expect(read.observation.effect).toBe('unknown')
    expect(read.observation.protocol).toBe(platform === 'windows' ? 'mdm.windows' : 'mdm.apple')
    expect('receiptAccepted' in read.observation).toBe(platform === 'windows')
    const received = decodeNativeOperation(
      native.handle(request(`${path}/${operationId}`), 'normal')?.body,
      operationId,
    )
    expect(received.commandStatus).toBe('received')
    expect(received.observation.effect).toBe('unknown')
    expect(native.executions().find((e) => e.id === operationId)).toMatchObject({
      receipt: 'received',
      execution: 'succeeded',
      effect: 'unverified',
      compliance: 'unknown',
    })
    expect(
      native.handle(
        request(`${path}/${operationId}/cancel`, { requestId: randomUUID(), expectedRevision: 1 }),
        'normal',
      )?.status,
    ).toBe(200)
    expect(native.executions()[0]?.effect).not.toBe('verified_absent')
  }
  const device = devices.facts()[0]!.summary.id
  expect(
    native.handle(
      request(`/api/v2/devices/${device}/operations`, {
        operationId: randomUUID(),
        task: { kind: 'firewall', enabled: true },
        deadline: 4102444800,
      }),
      'normal',
    )?.status,
  ).toBe(400)
})
