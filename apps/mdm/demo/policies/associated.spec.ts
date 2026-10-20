import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { setup } from '../devices/test-harness'
import { currentMember } from '../../src/features/devices/clients/endpoint-model'
import { deviceCondition } from '../../src/features/devices/clients/asset-model'
import { createScopeDemo } from './scopes'
import type { DemoRequest } from '../scenario'
it('keeps canonical associations in assignments, channel endpoints in Scope pages, and freezes old source evidence', async () => {
  const f = await setup(),
    mdm = currentMember(await f.directory.detail('device-05'), 'mdm')!,
    agent = currentMember(await f.directory.detail('device-01'), 'agent')!
  const association = await f.associations.confirm({
    operationId: randomUUID(),
    associationId: null,
    expectedVersion: 0,
    mdm,
    agent,
    evidence: 'Verified synthetic input',
  })
  const group = randomUUID(),
    created = await f.groups.change(group, {
      operationId: randomUUID(),
      expectedRevision: 0,
      input: {
        action: 'create',
        name: 'Associated',
        description: '',
        assetContext: 'associated_device',
        criteria: deviceCondition(),
      },
    })
  await f.groups.status(group, created.task!)
  await f.groups.status(group, created.task!)
  const scopes = createScopeDemo(f.domain),
    id = randomUUID(),
    task = randomUUID()
  const req = (path: string, body?: unknown, channel = 'agent'): DemoRequest => ({
    path,
    body,
    method: body ? 'POST' : 'GET',
    actor: { principalId: randomUUID(), sessionId: randomUUID() },
    headers: {},
    query: new URLSearchParams({ channel }),
  })
  expect(
    scopes.handle(
      req(`/api/v1/scopes/${id}`, {
        operationId: task,
        expectedRevision: 0,
        input: {
          action: 'put',
          definition: {
            targets: [{ kind: 'group', id: group }],
            limitations: null,
            exclusions: [],
          },
        },
      }),
      'normal',
    )?.status,
  ).toBe(200)
  scopes.handle(req(`/api/v1/scopes/${id}/tasks/${task}`), 'normal')
  scopes.handle(req(`/api/v1/scopes/${id}/tasks/${task}`), 'normal')
  const rows = scopes.assignments(id, 'agent'),
    pair = rows.find((r) => r.object.id === association.id)!
  expect(pair).toMatchObject({
    object: { kind: 'association', id: association.id },
    availability: 'ready',
    target: agent,
    sources: [{ associationVersion: association.version, members: [mdm, agent] }],
  })
  const missing = rows.find((r) => r.object.id === 'device-02')!
  expect(missing).toMatchObject({
    availability: 'unavailable',
    reason: 'channel_unavailable',
    target: null,
  })
  const old = await f.groups.page(group, created.task!, 'decisions')
  await f.enrollment.revoke(agent.device, agent.registrationId, randomUUID())
  expect(scopes.assignments(id, 'agent').find((r) => r.object.id === association.id)).toMatchObject(
    { availability: 'unavailable', reason: 'association_unverified' },
  )
  const history = await f.groups.page(group, created.task!, 'decisions')
  expect(history.page).toEqual(old.page)
  expect(history.current).toBe(false)
  const page = scopes.handle(req(`/api/v1/scopes/${id}/results/${task}/members`), 'normal')!
    .body as { page: { items: { kind: string }[] } }
  expect(page.page.items.every((o) => o.kind === 'endpoint')).toBe(true)
})
it('evaluates associated conditions only from evidence matching original registrations', async () => {
  const f = await setup(),
    mdm = currentMember(await f.directory.detail('device-05'), 'mdm')!,
    agent = currentMember(await f.directory.detail('device-01'), 'agent')!
  const association = await f.associations.confirm({
    operationId: randomUUID(),
    associationId: null,
    expectedVersion: 0,
    mdm,
    agent,
    evidence: 'Synthetic verified pair',
  })
  const group = randomUUID()
  const create = await f.groups.change(group, {
    operationId: randomUUID(),
    expectedRevision: 0,
    input: {
      action: 'create',
      name: 'Registered evidence',
      description: '',
      assetContext: 'associated_device',
      criteria: deviceCondition({
        kind: 'predicate',
        field: 'device.model',
        op: 'eq',
        value: { kind: 'string', value: 'ThinkPad T14' },
      }),
    },
  })
  await f.groups.status(group, create.task!)
  await f.groups.status(group, create.task!)
  expect((await f.groups.page(group, create.task!, 'members')).page).toMatchObject({
    items: expect.arrayContaining([{ kind: 'association', id: association.id }]),
  })
  const changed = await f.groups.change(group, {
    operationId: randomUUID(),
    expectedRevision: 1,
    input: {
      action: 'rule',
      criteria: deviceCondition({
        kind: 'predicate',
        field: 'custom.is_loaner',
        op: 'eq',
        value: { kind: 'boolean', value: false },
      }),
    },
  })
  await f.groups.status(group, changed.task!)
  await f.groups.status(group, changed.task!)
  const page = await f.groups.page(group, changed.task!, 'decisions')
  if (page.page.kind !== 'decisions') throw new Error('Wrong projection')
  expect(page.page.items.find((d) => d.object.id === association.id)?.decision).toBe('unknown')
})
