import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createPolicyDemo } from './policies'
import { createNativeDemo } from './native'
import { createDeviceDemo } from '../devices/state'
import type { DemoRequest } from '../scenario'
import type { ResourceRead } from '../../src/features/policies/clients/resources'
it('rejects stale saved plans and executes only frozen server-selected Windows targets', () => {
  const devices = createDeviceDemo(),
    native = createNativeDemo(devices),
    actor = { principalId: randomUUID(), sessionId: randomUUID() }
  const device = devices
    .facts()
    .find(
      (d) =>
        d.summary.platform === 'windows' &&
        d.summary.channels.includes('mdm') &&
        d.registrations.some((r) => r.status === 'active'),
    )!
  const scope = { id: randomUUID(), revision: 1, members: [device.summary.id], sources: [] }
  const resource: ResourceRead = {
    id: 'firewall',
    revision: 2,
    kind: 'configuration',
    versions: [
      {
        id: '1',
        state: 'active',
        configuration: { enabled: true },
        digest: Array(32).fill(1),
        variants: [],
      },
    ],
  }
  const policies = createPolicyDemo(
    devices,
    { freeze: () => structuredClone(scope) },
    { read: () => structuredClone(resource) },
    native,
  )
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
  const path = '/api/v2/policies/firewall'
  const change = (expectedRevision: number, input: unknown) =>
    policies.handle(
      request(path, { operationId: randomUUID(), expectedRevision, input }),
      'normal',
    )!
  expect(change(0, { action: 'create' }).status).toBe(200)
  expect(
    change(1, { action: 'activate', version: 1, resource: 'firewall', resourceVersion: '1' })
      .status,
  ).toBe(200)
  const task = randomUUID()
  expect(
    policies.handle(
      request(`${path}/previews`, {
        operationId: task,
        expectedRevision: 2,
        input: { scope: scope.id, expectedRevision: 2 },
      }),
      'normal',
    )?.status,
  ).toBe(202)
  policies.handle(request(`/api/v2/plan-previews/${task}`), 'normal')
  policies.handle(request(`/api/v2/plan-previews/${task}`), 'normal')
  const saved = policies.handle(
    request(`${path}/plans`, {
      operationId: randomUUID(),
      expectedRevision: 2,
      input: { preview: task },
    }),
    'normal',
  )!
  expect(saved.status).toBe(200)
  const plan = (saved.body as { plan: string }).plan
  scope.revision++
  const body = { operationId: randomUUID(), expectedRevision: 3, deadline: 4102444800 }
  expect(policies.handle(request(`${path}/plans/${plan}/execute`, body), 'normal')?.status).toBe(
    409,
  )
  expect(native.executions()).toEqual([])
  scope.revision--
  expect(policies.handle(request(`${path}/plans/${plan}/execute`, body), 'normal')?.status).toBe(
    202,
  )
  expect(native.executions()).toHaveLength(1)
  expect(native.executions()[0]).toMatchObject({
    device: device.summary.id,
    receipt: 'not_received',
    effect: 'unverified',
    compliance: 'unknown',
  })
})
