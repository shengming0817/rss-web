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
it('reconciles frozen history without re-adding current work and preserves terminal effects', () => {
  const devices = createDeviceDemo(),
    native = createNativeDemo(devices)
  const scope = { id: randomUUID(), revision: 1, members: ['device-01'], sources: [] }
  const resource: ResourceRead = {
    id: 'fw',
    revision: 1,
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
  const actor = { principalId: randomUUID(), sessionId: randomUUID() }
  const path = '/api/v2/policies/fw'
  function req(path: string, body?: unknown): DemoRequest {
    return {
      path,
      body,
      method: body === undefined ? 'GET' : 'POST',
      actor,
      headers: {},
      query: new URLSearchParams(),
    }
  }
  let revision = 0
  function change(input: unknown) {
    const reply = policies.handle(
      req(path, { operationId: randomUUID(), expectedRevision: revision, input }),
      'normal',
    )!
    expect(reply.status).toBe(200)
    revision++
  }
  function preview() {
    const task = randomUUID()
    expect(
      policies.handle(
        req(`${path}/previews`, {
          operationId: task,
          expectedRevision: revision,
          input: { scope: scope.id, expectedRevision: revision },
        }),
        'normal',
      )?.status,
    ).toBe(202)
    policies.handle(req(`/api/v2/plan-previews/${task}`), 'normal')
    expect(policies.handle(req(`/api/v2/plan-previews/${task}`), 'normal')?.body).toMatchObject({
      status: 'completed',
    })
    return task
  }
  function items(task: string, projection: string) {
    return (
      policies.handle(req(`${path}/results/${task}/${projection}`), 'normal')!.body as {
        page: { items: unknown[] }
      }
    ).page.items
  }
  function execute(task: string) {
    const saved = policies.handle(
      req(`${path}/plans`, {
        operationId: randomUUID(),
        expectedRevision: revision,
        input: { preview: task },
      }),
      'normal',
    )!
    expect(saved.status).toBe(200)
    revision++
    const plan = (saved.body as { plan: string }).plan
    const reply = policies.handle(
      req(`${path}/plans/${plan}/execute`, {
        operationId: randomUUID(),
        expectedRevision: revision,
        deadline: 4102444800,
      }),
      'normal',
    )!
    expect(reply.status).toBe(202)
    return reply
  }
  change({ action: 'create' })
  change({ action: 'activate', version: 1, resource: 'fw', resourceVersion: '1' })
  execute(preview())
  const original = native.executions()[0]!
  const repeated = preview()
  expect(items(repeated, 'add')).toEqual([])
  expect(items(repeated, 'retain')).toMatchObject([{ kind: 'retain', reason: 'current' }])
  execute(repeated)
  expect(native.executions()).toHaveLength(1)
  change({ action: 'pause' })
  const paused = preview()
  expect(items(paused, 'add')).toEqual([])
  expect(items(paused, 'retain')).toMatchObject([{ reason: 'paused' }])
  change({ action: 'activate', version: 2, resource: 'fw', resourceVersion: '1' })
  const replacement = preview()
  expect(items(replacement, 'supersede')).toEqual([
    { kind: 'supersede', device: 'device-01', version: 2 },
  ])
  expect(items(replacement, 'cancel')).toMatchObject([
    { reason: 'superseded', execution: { version: 1 } },
  ])
  expect(items(replacement, 'predecessors')).toMatchObject([
    { successor_version: 2, execution: { version: 1 } },
  ])
  execute(replacement)
  expect(native.executions().find((e) => e.id === original.id)?.execution).toBe('cancelled')
  const next = native.executions().find((e) => e.id !== original.id)!
  native.handle(req(`/api/v2/devices/device-01/operations/${next.id}`), 'normal')
  native.handle(req(`/api/v2/devices/device-01/operations/${next.id}`), 'normal')
  change({ action: 'archive' })
  const archived = preview()
  expect(items(archived, 'cancel')).toEqual([])
  expect(items(archived, 'retain')).toHaveLength(2)
  expect(items(archived, 'retain')).toMatchObject([
    { reason: 'historical' },
    { reason: 'historical' },
  ])
  execute(archived)
  expect(native.executions().find((e) => e.id === next.id)).toMatchObject({
    execution: 'succeeded',
    effect: 'unverified',
    receipt: 'received',
  })
})
