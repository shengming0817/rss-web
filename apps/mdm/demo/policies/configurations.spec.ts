import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createConfigurationDemo } from './configurations'
import { createDeviceDemo } from '../devices/state'
import type { DemoRequest } from '../scenario'
it('freezes configuration versions, computes differences, and previews candidate execution without claiming real effects', () => {
  const devices = createDeviceDemo(),
    actor = { principalId: randomUUID(), sessionId: randomUUID() },
    id = randomUUID(),
    scope = {
      id: randomUUID(),
      revision: 1,
      members: devices
        .facts()
        .slice(0, 2)
        .map((d) => d.summary.id),
      sources: [],
    }
  const configs = createConfigurationDemo(
    devices,
    { freeze: () => structuredClone(scope) },
    () => false,
    () => [],
  )
  function request(path: string, body?: unknown, query = new URLSearchParams()): DemoRequest {
    return { path, body, method: body === undefined ? 'GET' : 'POST', actor, headers: {}, query }
  }
  const path = `/api/v1/mdm-candidate/policies/configurations/${id}`
  let revision = 0
  function change(input: unknown) {
    const reply = configs.handle(
      request(path, { operationId: randomUUID(), expectedRevision: revision, input }),
      'normal',
    )!
    if (reply.status === 200) revision++
    return reply
  }
  expect(
    change({ action: 'create', name: 'Restrictions', platform: 'windows', format: 'windows_csp' })
      .status,
  ).toBe(200)
  expect(
    change({ action: 'version', settings: [{ key: 'AllowCamera', value: false }] }).status,
  ).toBe(200)
  expect(change({ action: 'publish', version: 1 }).status).toBe(200)
  expect(
    change({ action: 'version', settings: [{ key: 'AllowCamera', value: true }] }).status,
  ).toBe(200)
  expect(
    configs.handle(
      request(`${path}/diff`, undefined, new URLSearchParams({ from: '1', to: '2' })),
      'normal',
    )?.body,
  ).toMatchObject({ items: [{ key: 'AllowCamera', before: false, after: true }] })
  const task = randomUUID()
  expect(
    configs.handle(
      request(`${path}/previews`, {
        operationId: task,
        expectedRevision: revision,
        input: { version: 1, scope: scope.id },
      }),
      'normal',
    )?.status,
  ).toBe(202)
  configs.handle(request(`${path}/previews/${task}`), 'normal')
  expect(configs.handle(request(`${path}/previews/${task}`), 'normal')?.body).toMatchObject({
    preview: {
      status: 'completed',
      rows: expect.arrayContaining([
        expect.objectContaining({ support: 'executable', reason: null, drift: 'unknown' }),
      ]),
    },
  })
})
