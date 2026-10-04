import { afterEach, expect, it, vi } from 'vitest'
import { createDeviceDemo } from '../devices/state'
import { createAutomationDemo } from '../policies/state'
import { createScenario, TENANT } from '../scenario'
import { operation } from '../../src/services/useOperation'
afterEach(() => vi.restoreAllMocks())

async function fixture(devices = createDeviceDemo()) {
  const automation = createAutomationDemo(devices)
  const server = createScenario(
    [automation.handle, devices.handle],
    () => {
      devices.reset()
      automation.reset()
    },
    (event, scenario) => automation.tick(event, scenario),
    automation.observe,
  )
  const login = await server.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const headers = {
    'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
    'x-identity-request': '1',
  }
  return {
    server,
    write: (method: string, path: string, body: unknown) =>
      server.handle(method, path, body, headers),
  }
}
const definition = {
  name: 'Synthetic asset placement baseline',
  severity: 'medium',
  enabled: true,
  platform: 'all',
  target: { kind: 'all' },
  criteria: {
    kind: 'predicate',
    field: 'custom.office_floor',
    op: 'ge',
    value: { kind: 'integer', value: 1 },
  },
}

it('timestamps saved rules, recomputation and published evidence using the advanced scenario clock', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1780000000000)
  const f = await fixture(),
    at = 1780003600,
    path = `/api/v1/compliance-rules/${crypto.randomUUID()}`
  await f.write('POST', '/api/v1/mdm-candidate/workspace/scenario', {
    event: { kind: 'clock', at },
  })
  const created = await f.write('PUT', path, operation(definition))
  const first = (created.body as { task: string }).task
  await f.server.handle('GET', `${path}/tasks/${first}`)
  await f.server.handle('GET', `${path}/tasks/${first}`)
  const recomputed = await f.write('POST', `${path}/recompute`, operation({}, 1))
  const second = (recomputed.body as { task: string }).task
  await f.server.handle('GET', `${path}/tasks/${second}`)
  await f.server.handle('GET', `${path}/tasks/${second}`)
  const history = (
    await f.server.handle('GET', `/api/v1/devices/device-01/compliance/history?from=${at}`)
  ).body as { items: { evaluatedAt: number }[] }
  expect(history.items).toHaveLength(2)
  expect(history.items.every((item) => item.evaluatedAt === at)).toBe(true)
  for (const action of ['compliance_saved', 'compliance_recomputed', 'compliance_evaluated']) {
    const audit = (
      await f.server.handle(
        'GET',
        `/api/v1/mdm-candidate/operations/audit?action=${action}&from=${at}`,
      )
    ).body as { items: { at: number }[] }
    expect(audit.items.length).toBeGreaterThan(0)
    expect(audit.items.every((item) => item.at === at)).toBe(true)
  }
})

it('keeps native rule versions, pending previous evidence and immutable history distinct across recomputation', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1780000000000)
  const f = await fixture(),
    id = crypto.randomUUID(),
    path = `/api/v1/compliance-rules/${id}`
  const created = await f.write('PUT', path, operation(definition))
  expect(created.status).toBe(200)
  const receipt = created.body as { id: string; revision: number; task: string }
  expect(receipt).toMatchObject({ id, revision: 1 })
  const currentPath = '/api/v1/devices/device-01/compliance'
  expect((await f.server.handle('GET', currentPath)).body).toMatchObject({
    device: 'device-01',
    status: 'pending',
    rules: [{ ruleId: id, current: null, previous: null }],
  })
  const task = `${path}/tasks/${receipt.task}`
  expect((await f.server.handle('GET', task)).body).toMatchObject({
    task: receipt.task,
    ruleId: id,
    ruleVersion: 1,
    phase: 'evaluating',
  })
  expect((await f.server.handle('GET', task)).body).toMatchObject({
    phase: 'published',
    completed: true,
  })
  const failed = (await f.server.handle('GET', currentPath)).body as {
    rules: { current: unknown }[]
  }
  expect(failed).toMatchObject({
    status: 'non_compliant',
    rules: [
      {
        current: {
          ruleVersion: 1,
          status: 'non_compliant',
          reason: 'rule_failed',
          evidence: [{ field: 'custom.office_floor' }],
        },
        previous: null,
      },
    ],
  })
  expect(JSON.stringify(failed)).not.toContain('"value"')
  const revised = {
    ...definition,
    criteria: { ...definition.criteria, value: { kind: 'integer', value: 0 } },
  }
  clock.mockReturnValue(1780000001000)
  const changed = await f.write('PUT', path, operation(revised, 1))
  expect(changed.status).toBe(200)
  expect((await f.server.handle('GET', `${path}/versions/1`)).body).toMatchObject({
    id,
    revision: 1,
    definition,
  })
  expect((await f.server.handle('GET', currentPath)).body).toMatchObject({
    status: 'pending',
    rules: [{ ruleVersion: 2, current: null, previous: failed.rules[0]!.current }],
  })
  const nextTask = (changed.body as { task: string }).task
  await f.server.handle('GET', `${path}/tasks/${nextTask}`)
  await f.server.handle('GET', `${path}/tasks/${nextTask}`)
  expect((await f.server.handle('GET', currentPath)).body).toMatchObject({ status: 'compliant' })
  const history = await f.server.handle('GET', `${currentPath}/history?limit=1`)
  expect(history.body).toMatchObject({
    items: [{ task: nextTask, ruleVersion: 2, disposition: 'published' }],
  })
  const cursor = (history.body as { nextCursor: string }).nextCursor
  expect(cursor).toBeTruthy()
  const next = await f.server.handle(
    'GET',
    `${currentPath}/history?limit=1&cursor=${encodeURIComponent(cursor)}`,
  )
  expect(next.body).toMatchObject({
    items: [{ task: receipt.task, ruleVersion: 1 }],
    nextCursor: null,
  })
  expect(
    (
      await f.server.handle(
        'GET',
        `/api/v1/devices/device-02/compliance/history?cursor=${encodeURIComponent(cursor)}`,
      )
    ).status,
  ).toBe(400)
  expect(
    (
      await f.server.handle(
        'GET',
        `${currentPath}/history?from=1&cursor=${encodeURIComponent(cursor)}`,
      )
    ).status,
  ).toBe(400)
})

it('replays exact unknown native operations and requires nonempty Criteria without treating no rules as compliant', async () => {
  const f = await fixture(),
    id = crypto.randomUUID(),
    path = `/api/v1/compliance-rules/${id}`
  expect((await f.server.handle('GET', '/api/v1/devices/device-01/compliance')).body).toMatchObject(
    { status: 'unknown', reason: 'no_rules', rules: [] },
  )
  expect((await f.write('PUT', path, operation({ ...definition, criteria: null }))).status).toBe(
    400,
  )
  const write = operation(definition)
  f.server.set('unknown')
  expect((await f.write('PUT', path, write)).status).toBe(503)
  f.server.set('normal')
  const recovered = await f.write('PUT', path, write)
  expect(recovered.status).toBe(200)
  expect((await f.write('PUT', path, write)).body).toEqual(recovered.body)
  expect(
    (await f.write('PUT', path, { ...write, input: { ...definition, name: 'Changed' } })).status,
  ).toBe(409)
  expect((await f.write('POST', `${path}/recompute`, operation({}, 0))).status).toBe(409)
  expect((await f.write('POST', `${path}/recompute`, operation({}, 1))).status).toBe(200)
  f.server.set('denied')
  expect((await f.server.handle('GET', path)).status).toBe(403)
})

it('keeps native rule list after pagination separate from history cursor pagination', async () => {
  const f = await fixture()
  const ids = Array.from({ length: 51 }, () => crypto.randomUUID()).sort()
  for (const id of ids)
    expect(
      (
        await f.write(
          'PUT',
          `/api/v1/compliance-rules/${id}`,
          operation({ ...definition, enabled: false }),
        )
      ).status,
    ).toBe(200)
  const first = (await f.server.handle('GET', '/api/v1/compliance-rules')).body as {
    items: { id: string }[]
    nextCursor: string
  }
  expect(first.items.map((v) => v.id)).toEqual(ids.slice(0, 50))
  expect(first.nextCursor).toBe(ids[49])
  expect(
    (await f.server.handle('GET', `/api/v1/compliance-rules?after=${first.nextCursor}`)).body,
  ).toMatchObject({ items: [{ id: ids[50] }], nextCursor: null })
  expect((await f.server.handle('GET', '/api/v1/compliance-rules?cursor=unsupported')).status).toBe(
    400,
  )
})

it('supersedes an unready frozen group input, then preserves old evidence when its membership changes', async () => {
  const devices = createDeviceDemo(),
    group = crypto.randomUUID()
  let members = {
    members: ['device-01'],
    memberSet: null as string | null,
    memberVersion: 0,
    definitionVersion: 1,
    authorityVersion: 1,
    ready: false,
  }
  vi.spyOn(devices, 'publishedGroup').mockImplementation((id) =>
    id === group ? structuredClone(members) : null,
  )
  const f = await fixture(devices),
    id = crypto.randomUUID(),
    path = `/api/v1/compliance-rules/${id}`
  const input = { ...definition, target: { kind: 'groups', ids: [group] } }
  const task = (await f.write('PUT', path, operation(input))).body as { task: string }
  await f.server.handle('GET', `${path}/tasks/${task.task}`)
  expect((await f.server.handle('GET', `${path}/tasks/${task.task}`)).body).toMatchObject({
    phase: 'superseded',
    completed: true,
    failure: 'superseded',
    diagnostic: { reason: 'group_input_pending' },
  })
  members = { ...members, memberSet: crypto.randomUUID(), memberVersion: 1, ready: true }
  const next = (await f.write('POST', `${path}/recompute`, operation({}, 1))).body as {
    task: string
  }
  await f.server.handle('GET', `${path}/tasks/${next.task}`)
  await f.server.handle('GET', `${path}/tasks/${next.task}`)
  const current = '/api/v1/devices/device-01/compliance'
  expect((await f.server.handle('GET', current)).body).toMatchObject({ status: 'non_compliant' })
  members = { ...members, members: [], memberSet: crypto.randomUUID(), memberVersion: 2 }
  expect((await f.server.handle('GET', current)).body).toMatchObject({
    status: 'pending',
    rules: [
      { current: null, previous: { status: 'non_compliant', groups: [{ memberVersion: 1 }] } },
    ],
  })
  const latest = (await f.write('POST', `${path}/recompute`, operation({}, 1))).body as {
    task: string
  }
  await f.server.handle('GET', `${path}/tasks/${latest.task}`)
  await f.server.handle('GET', `${path}/tasks/${latest.task}`)
  expect((await f.server.handle('GET', current)).body).toMatchObject({ status: 'not_applicable' })
})

it('evaluates an empty static group as not applicable and retains history if its group is deleted', async () => {
  const f = await fixture(),
    group = '33333333-3333-4333-8333-333333333333',
    id = crypto.randomUUID(),
    path = `/api/v1/compliance-rules/${id}`
  const created = await f.write(
    'PUT',
    path,
    operation({ ...definition, target: { kind: 'groups', ids: [group] } }),
  )
  const { task } = created.body as { task: string }
  await f.server.handle('GET', `${path}/tasks/${task}`)
  expect((await f.server.handle('GET', `${path}/tasks/${task}`)).body).toMatchObject({
    phase: 'published',
  })
  const current = '/api/v1/devices/device-01/compliance'
  expect((await f.server.handle('GET', current)).body).toMatchObject({
    status: 'not_applicable',
    rules: [{ current: { groups: [{ ready: true, memberSet: null }] } }],
  })
  await f.write('POST', `/api/v1/groups/${group}`, operation({ action: 'delete' }, 1))
  expect((await f.server.handle('GET', current)).body).toMatchObject({
    status: 'pending',
    rules: [{ current: null, previous: { status: 'not_applicable' } }],
  })
  expect((await f.server.handle('GET', `${current}/history`)).body).toMatchObject({
    items: [{ task, status: 'not_applicable' }],
  })
})

it('invalidates dynamic group inputs after fact changes even when the compliance condition did not use that field', async () => {
  const f = await fixture(),
    group = crypto.randomUUID(),
    groupPath = `/api/v1/groups/${group}`
  const groupWrite = operation({
    action: 'create',
    name: 'Office members',
    description: '',
    criteria: definition.criteria,
  })
  expect((await f.write('POST', groupPath, groupWrite)).status).toBe(200)
  await f.server.handle('GET', `${groupPath}/tasks/${groupWrite.operationId}`)
  await f.server.handle('GET', `${groupPath}/tasks/${groupWrite.operationId}`)
  const rule = crypto.randomUUID(),
    path = `/api/v1/compliance-rules/${rule}`
  const { task } = (
    await f.write(
      'PUT',
      path,
      operation({
        ...definition,
        target: { kind: 'groups', ids: [group] },
        criteria: { kind: 'and', children: [] },
      }),
    )
  ).body as { task: string }
  await f.server.handle('GET', `${path}/tasks/${task}`)
  await f.server.handle('GET', `${path}/tasks/${task}`)
  const current = '/api/v1/devices/device-01/compliance'
  expect((await f.server.handle('GET', current)).body).toMatchObject({ status: 'not_applicable' })
  expect(
    (
      await f.write(
        'PUT',
        '/api/v1/devices/device-01/manual-fields/custom.office_floor',
        operation({ action: 'set', value: { kind: 'integer', value: 2 } }, 1),
      )
    ).status,
  ).toBe(200)
  expect((await f.server.handle('GET', current)).body).toMatchObject({
    status: 'pending',
    rules: [{ current: null, previous: { status: 'not_applicable' } }],
  })
  const waiting = (await f.write('POST', `${path}/recompute`, operation({}, 1))).body as {
    task: string
  }
  await f.server.handle('GET', `${path}/tasks/${waiting.task}`)
  expect((await f.server.handle('GET', `${path}/tasks/${waiting.task}`)).body).toMatchObject({
    phase: 'superseded',
    diagnostic: { reason: 'group_input_pending' },
  })
})

it('uses active platform provenance and keeps partial tasks from publishing a compliant current conclusion', async () => {
  const devices = createDeviceDemo(),
    facts = devices.facts()
  // Inventory still says Windows, but only device provenance may establish applicability.
  facts[0]!.registrations = []
  vi.spyOn(devices, 'facts').mockImplementation(() => structuredClone(facts))
  const f = await fixture(devices),
    rule = crypto.randomUUID(),
    path = `/api/v1/compliance-rules/${rule}`
  const { task } = (
    await f.write(
      'PUT',
      path,
      operation({ ...definition, platform: 'windows', criteria: { kind: 'and', children: [] } }),
    )
  ).body as { task: string }
  await f.server.handle('GET', `${path}/tasks/${task}`)
  await f.server.handle('GET', `${path}/tasks/${task}`)
  const current = '/api/v1/devices/device-01/compliance'
  expect((await f.server.handle('GET', current)).body).toMatchObject({
    status: 'unknown',
    rules: [{ current: { reason: 'platform_unknown' } }],
  })
  const partial = (await f.write('POST', `${path}/recompute`, operation({}, 1))).body as {
    task: string
  }
  f.server.set('partial')
  await f.server.handle('GET', `${path}/tasks/${partial.task}`)
  expect((await f.server.handle('GET', `${path}/tasks/${partial.task}`)).body).toMatchObject({
    phase: 'failed',
  })
  expect((await f.server.handle('GET', current)).body).toMatchObject({
    status: 'pending',
    rules: [{ current: null, previous: { status: 'unknown' } }],
  })
})
