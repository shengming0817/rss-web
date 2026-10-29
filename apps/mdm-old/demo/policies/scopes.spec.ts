import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createScopeDemo } from './scopes'
import { deviceCondition } from '../../src/features/devices/clients/asset-model'
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
    query: new URLSearchParams(path.includes('/results/') ? { channel: 'mdm' } : {}),
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
  ).toMatchObject({ current: false, page: { items: [{ kind: 'endpoint', id: device }] } })
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
      input: { action: 'members', add: [{ kind: 'endpoint', id: device }], remove: [] },
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
        expectedRevision: 1,
        input: { action: 'members', add: [{ kind: 'endpoint', id: 'device-02' }], remove: [] },
      }),
      'normal',
    )?.status,
  ).toBe(202)
  devices.handle(request(`/api/v1/groups/${group}/tasks/${changed}`), 'normal')
  devices.handle(request(`/api/v1/groups/${group}/tasks/${changed}`), 'normal')
  expect(scopes.freeze(id)).toBeNull()
  expect(
    scopes.handle(request(`/api/v1/scopes/${id}/results/${op}/members`), 'normal')?.body,
  ).toMatchObject({ current: true, page: { items: [{ kind: 'endpoint', id: device }] } })
})

it('blocks current Scope consumers while a changed dynamic group is pending and preserves frozen pages', () => {
  const devices = createDeviceDemo(),
    scopes = createScopeDemo(devices)
  const group = randomUUID(),
    first = randomUUID(),
    id = randomUUID(),
    task = randomUUID()
  const condition = (value: boolean) =>
    deviceCondition({
      kind: 'predicate',
      field: 'custom.is_loaner',
      op: 'eq',
      value: { kind: 'boolean', value },
    })
  devices.handle(
    request(`/api/v1/groups/${group}`, {
      operationId: first,
      expectedRevision: 0,
      input: {
        action: 'create',
        presentation: { name: 'Pending source', description: '' },
        assetContext: 'endpoint',
        criteria: condition(false),
      },
    }),
    'normal',
  )
  devices.handle(request(`/api/v1/groups/${group}/tasks/${first}`), 'normal')
  devices.handle(request(`/api/v1/groups/${group}/tasks/${first}`), 'normal')
  devices.handle(request(`/api/v1/groups/${group}`), 'normal')
  devices.handle(request(`/api/v1/groups/${group}`), 'normal')
  expect(devices.publishedGroup(group)?.ready).toBe(true)
  scopes.handle(
    request(`/api/v1/scopes/${id}`, {
      operationId: task,
      expectedRevision: 0,
      input: {
        action: 'put',
        definition: { targets: [{ kind: 'group', id: group }], limitations: null, exclusions: [] },
      },
    }),
    'normal',
  )
  scopes.handle(request(`/api/v1/scopes/${id}/tasks/${task}`), 'normal')
  scopes.handle(request(`/api/v1/scopes/${id}/tasks/${task}`), 'normal')
  const path = `/api/v1/scopes/${id}/results/${task}/members`
  const history = scopes.handle(request(path), 'normal')?.body
  const changed = randomUUID()
  devices.handle(
    request(`/api/v1/groups/${group}`, {
      operationId: changed,
      expectedRevision: 1,
      input: { action: 'rule', criteria: condition(true) },
    }),
    'normal',
  )
  expect(devices.publishedGroup(group)?.ready).toBe(true)
  devices.handle(request(`/api/v1/groups/${group}/tasks/${changed}`), 'normal')
  devices.handle(request(`/api/v1/groups/${group}/tasks/${changed}`), 'normal')
  expect(devices.publishedGroup(group)?.ready).toBe(false)
  expect(scopes.freeze(id)).toBeNull()
  expect(scopes.snapshot(id)?.result).toBe(task)
  expect(
    scopes
      .assignments(id, 'agent')
      .every(
        (row) =>
          row.qualification.state === 'pending' &&
          row.reason === (row.target ? 'source_pending' : 'channel_unavailable') &&
          row.availability === 'unavailable',
      ),
  ).toBe(true)
  expect(scopes.handle(request(path), 'normal')?.body).toEqual(history)
  devices.handle(request(`/api/v1/groups/${group}`), 'normal')
  devices.handle(request(`/api/v1/groups/${group}`), 'normal')
  expect(scopes.snapshot(id)).not.toBeNull()
  expect(scopes.freeze(id)).not.toBeNull()
})

it.each(['limitations', 'exclusions'] as const)(
  'keeps unknown %s pending until a definite result dominates',
  (role) => {
    const devices = createDeviceDemo(),
      scopes = createScopeDemo(devices),
      group = randomUUID(),
      op = randomUUID(),
      id = randomUUID(),
      task = randomUUID(),
      device = 'device-01'
    devices.handle(
      request(`/api/v1/groups/${group}`, {
        operationId: op,
        expectedRevision: 0,
        input: {
          action: 'create',
          assetContext: 'endpoint',
          presentation: { name: 'Unknown qualification', description: '' },
          criteria: deviceCondition({
            kind: 'predicate',
            field: 'custom.purchase_date',
            op: 'eq',
            value: { kind: 'time', value: 0 },
          }),
        },
      }),
      'normal',
    )
    devices.handle(request(`/api/v1/groups/${group}/tasks/${op}`), 'normal')
    devices.handle(request(`/api/v1/groups/${group}/tasks/${op}`), 'normal')
    devices.handle(request(`/api/v1/groups/${group}`), 'normal')
    devices.handle(request(`/api/v1/groups/${group}`), 'normal')
    const ref = { kind: 'group', id: group },
      known = { kind: 'device', id: device }
    const put = (operationId: string, expectedRevision: number, definition: unknown) =>
      scopes.handle(
        request(`/api/v1/scopes/${id}`, {
          operationId,
          expectedRevision,
          input: { action: 'put', definition },
        }),
        'normal',
      )
    const publish = (task: string) => {
      scopes.handle(request(`/api/v1/scopes/${id}/tasks/${task}`), 'normal')
      scopes.handle(request(`/api/v1/scopes/${id}/tasks/${task}`), 'normal')
    }
    const definition = {
      targets: [known],
      limitations: role === 'limitations' ? [ref] : null,
      exclusions: role === 'exclusions' ? [ref] : [],
    }
    expect(put(task, 0, definition)?.status).toBe(200)
    publish(task)
    expect(scopes.assignments(id, 'agent').find((r) => r.object.id === device)).toMatchObject({
      qualification: { state: 'pending' },
      availability: 'unavailable',
      reason: 'source_pending',
    })
    expect(scopes.freeze(id, 'agent')?.members).toEqual([])
    const next = randomUUID()
    expect(
      put(next, 1, {
        ...definition,
        limitations: role === 'limitations' ? [ref, known] : [],
        exclusions: role === 'exclusions' ? [ref] : [],
      })?.status,
    ).toBe(200)
    publish(next)
    expect(
      scopes.assignments(id, 'agent').find((r) => r.object.id === device)?.qualification.state,
    ).toBe(role === 'limitations' ? 'eligible' : 'excluded')
  },
)
