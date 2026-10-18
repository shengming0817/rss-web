import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createNativeDemo } from './native'
import { createDeviceDemo } from '../devices/state'
import { request } from '../software/fixtures'
it('creates current controls and rejects stale dangerous confirmation and post-dispatch reauthorization', () => {
  const devices = createDeviceDemo(),
    demo = createNativeDemo(devices),
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
