import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createScopeDemo } from './scopes'
import { createDeviceDemo } from '../devices/state'
import type { DemoRequest } from '../scenario'
const actor = { principalId: randomUUID(), sessionId: randomUUID() }
function request(path: string, body?: unknown): DemoRequest {
  return {
    path,
    method: body === undefined ? 'GET' : 'POST',
    body,
    actor,
    headers: {},
    query: new URLSearchParams(),
  }
}
it('distinguishes unlimited from empty limitations and keeps old Scope results frozen', () => {
  const devices = createDeviceDemo(),
    scopes = createScopeDemo(devices)
  const id = randomUUID(),
    task = randomUUID(),
    device = devices.facts()[0]!.summary.id
  const definition = {
    targets: [{ kind: 'device', id: device }],
    limitations: null,
    exclusions: [],
  }
  expect(
    scopes.handle(
      request(`/api/v1/scopes/${id}`, {
        operationId: task,
        expectedRevision: 0,
        input: { action: 'put', definition },
      }),
      'normal',
    )?.status,
  ).toBe(200)
  scopes.handle(request(`/api/v1/scopes/${id}/tasks/${task}`), 'normal')
  scopes.handle(request(`/api/v1/scopes/${id}/tasks/${task}`), 'normal')
  expect(scopes.freeze(id)?.members).toEqual([device])
  const next = randomUUID()
  scopes.handle(
    request(`/api/v1/scopes/${id}`, {
      operationId: next,
      expectedRevision: 1,
      input: { action: 'put', definition: { ...definition, limitations: [] } },
    }),
    'normal',
  )
  scopes.handle(request(`/api/v1/scopes/${id}/tasks/${next}`), 'normal')
  scopes.handle(request(`/api/v1/scopes/${id}/tasks/${next}`), 'normal')
  expect(scopes.freeze(id)?.members).toEqual([])
  expect(
    scopes.handle(request(`/api/v1/scopes/${id}/results/${task}/members`), 'normal')?.body,
  ).toMatchObject({ current: false, page: { items: [device] } })
})
it('uses published group membership, never a running or preview membership set', () => {
  const devices = createDeviceDemo(),
    scopes = createScopeDemo(devices)
  const group = '33333333-3333-4333-8333-333333333333',
    task = randomUUID(),
    device = devices.facts()[0]!.summary.id
  devices.handle(
    request(`/api/v1/groups/${group}`, {
      operationId: task,
      expectedRevision: 1,
      input: { action: 'members', add: [device], remove: [] },
    }),
    'normal',
  )
  expect(devices.publishedGroup(group)?.members).toEqual([])
  devices.handle(request(`/api/v1/groups/${group}/tasks/${task}`), 'normal')
  devices.handle(request(`/api/v1/groups/${group}/tasks/${task}`), 'normal')
  expect(devices.publishedGroup(group)?.members).toEqual([device])
  const id = randomUUID(),
    op = randomUUID()
  scopes.handle(
    request(`/api/v1/scopes/${id}`, {
      operationId: op,
      expectedRevision: 0,
      input: {
        action: 'put',
        definition: { targets: [{ kind: 'group', id: group }], limitations: null, exclusions: [] },
      },
    }),
    'normal',
  )
  scopes.handle(request(`/api/v1/scopes/${id}/tasks/${op}`), 'normal')
  scopes.handle(request(`/api/v1/scopes/${id}/tasks/${op}`), 'normal')
  expect(scopes.freeze(id)).toMatchObject({
    members: [device],
    sources: [{ memberSet: task, memberVersion: 1 }],
  })
  const changed = randomUUID()
  expect(
    devices.handle(
      request(`/api/v1/groups/${group}`, {
        operationId: changed,
        expectedRevision: 2,
        input: { action: 'members', add: ['device-02'], remove: [] },
      }),
      'normal',
    )?.status,
  ).toBe(202)
  devices.handle(request(`/api/v1/groups/${group}/tasks/${changed}`), 'normal')
  devices.handle(request(`/api/v1/groups/${group}/tasks/${changed}`), 'normal')
  expect(scopes.freeze(id)).toBeNull()
  expect(
    scopes.handle(request(`/api/v1/scopes/${id}/results/${op}/members`), 'normal')?.body,
  ).toMatchObject({ current: true, page: { items: [device] } })
})
