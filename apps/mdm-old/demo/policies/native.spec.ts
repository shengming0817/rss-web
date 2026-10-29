import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createNativeDemo } from './native'
import { createDeviceDemo } from '../devices/state'
import { request } from '../software/fixtures'
it('creates current controls and rejects stale dangerous confirmation and post-dispatch reauthorization', () => {
  const devices = createDeviceDemo(),
    demo = createNativeDemo(devices, () => true),
    d = devices
      .facts()
      .find(
        (d) =>
          d.summary.platform === 'macos' &&
          d.registrations.some((r) => r.source === 'mdm.apple' && r.status === 'active'),
      )!,
    reg = d.registrations.find((r) => r.source === 'mdm.apple' && r.status === 'active')!,
    id = randomUUID(),
    path = `/api/v1/devices/${d.summary.id}/operations`
  const action = {
    kind: 'wipe',
    confirmed: true,
    expectedRegistrationId: reg.registrationId,
    expectedGeneration: reg.generation,
  }
  expect(
    demo.handle(
      request(path, {
        operationId: id,
        deadline: 4102444800,
        action: { ...action, expectedGeneration: 999 },
      }),
      'normal',
    )?.status,
  ).toBe(409)
  expect(
    demo.handle(request(path, { operationId: id, deadline: 4102444800, action }), 'normal')?.status,
  ).toBe(202)
  const body = {
    requestId: randomUUID(),
    expectedRevision: 1,
    confirmation: {
      confirmed: true,
      expectedRegistrationId: reg.registrationId,
      expectedGeneration: reg.generation,
    },
  }
  expect(demo.handle(request(path + `/${id}/reauthorize`, body), 'normal')?.status).toBe(200)
  demo.handle(request(path + `/${id}`), 'normal')
  demo.handle(request(path + `/${id}`), 'normal')
  expect(
    demo.handle(
      request(path + `/${id}/reauthorize`, {
        ...body,
        requestId: randomUUID(),
        expectedRevision: 2,
      }),
      'normal',
    )?.status,
  ).toBe(409)
})

it('projects registration changes into the directory without first reading the operation detail', () => {
  const devices = createDeviceDemo(),
    demo = createNativeDemo(devices, () => true)
  const d = devices
    .facts()
    .find(
      (d) =>
        d.summary.platform === 'macos' &&
        d.registrations.some((r) => r.status === 'active' && r.source !== 'agent.builtin'),
    )!
  const reg = d.registrations.find((r) => r.status === 'active' && r.source !== 'agent.builtin')!
  const id = randomUUID()
  expect(
    demo.handle(
      request(`/api/v1/devices/${d.summary.id}/operations`, {
        operationId: id,
        deadline: 4102444800,
        action: { kind: 'restart' },
      }),
      'normal',
    )?.status,
  ).toBe(202)
  devices.handle(
    {
      ...request(`/api/v1/devices/${d.summary.id}/registrations/${reg.registrationId}/revoke`, {}),
      headers: { 'idempotency-key': randomUUID() },
    },
    'normal',
  )
  expect(demo.directory('reader')[0]).toMatchObject({
    authorization: { state: 'blocked', reason: 'registration_changed' },
    reauthorization: { state: 'unavailable', reason: 'registration_changed' },
  })
})
