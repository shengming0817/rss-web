import { expect, it } from 'vitest'
import { createAutomationDemo } from './state'
import { createPolicyDemo } from './policies'
import { createDeviceDemo } from '../devices/state'
import { seedScriptPolicies } from './seed'
import type { DemoRequest } from '../scenario'
import type { PolicyRead } from '../../src/features/policies/clients/model'
function fixture() {
  const automation = createAutomationDemo(createDeviceDemo()),
    seed = seedScriptPolicies(automation)
  const actor = {
    principalId: '22222222-2222-4222-8222-222222222222',
    sessionId: crypto.randomUUID(),
  }
  function request(path: string, body?: unknown, query = new URLSearchParams()): DemoRequest {
    return { path, body, query, actor, headers: {}, method: body === undefined ? 'GET' : 'POST' }
  }
  function write(id: string, revision: number, input: unknown, operationId = crypto.randomUUID()) {
    return automation.handle(
      request(`/api/v1/policies/${id}`, { operationId, expectedRevision: revision, input }),
      'normal',
    )!
  }
  function read(id: string) {
    return automation.handle(request(`/api/v1/policies/${id}`), 'normal')!.body as PolicyRead
  }
  return { automation, seed, request, write, read }
}
it('seeds independently published, manual-only, withdrawn and disabled policies without admitting executions', () => {
  const f = fixture()
  expect(
    f.seed.ids
      .map((id) => f.read(id))
      .map((p) => [
        p.enabled,
        p.definition.selfService?.published,
        p.definition.selfService?.allowAi,
        p.definition.selfService?.riskLevel,
      ]),
  ).toEqual([
    [true, true, true, 2],
    [true, true, false, 1],
    [true, false, true, 2],
    [false, true, true, 2],
  ])
  expect(
    f.automation.handle(f.request('/api/v1/mdm-candidate/executions'), 'normal')?.body,
  ).toMatchObject({ items: [] })
  expect(
    f.automation.handle(f.request('/api/v1/mdm-candidate/policies/assignments/legacy'), 'normal'),
  ).toBeUndefined()
})
it('normalizes first-publication defaults, preserves existing values, and keeps withdrawal separate from disable', () => {
  const f = fixture(),
    id = crypto.randomUUID(),
    metadata = {
      published: true,
      displayName: 'Support',
      description: '',
      prerequisites: '',
      sideEffects: '',
      category: 'Support',
      keywords: [],
    }
  expect(
    f.write(id, 0, {
      action: 'put',
      enabled: true,
      definition: { ...f.seed.definition, selfService: metadata },
    }).status,
  ).toBe(200)
  expect(f.read(id).definition.selfService).toMatchObject({ allowAi: true, riskLevel: 2 })
  expect(
    f.write(id, 1, {
      action: 'put',
      enabled: true,
      definition: {
        ...f.seed.definition,
        selfService: { ...metadata, allowAi: false, riskLevel: 1 },
      },
    }).status,
  ).toBe(200)
  expect(
    f.write(id, 2, {
      action: 'put',
      enabled: true,
      definition: { ...f.seed.definition, selfService: { ...metadata, published: false } },
    }).status,
  ).toBe(200)
  expect(f.read(id)).toMatchObject({
    enabled: true,
    definition: { selfService: { published: false, allowAi: false, riskLevel: 1 } },
  })
  expect(f.write(id, 3, { action: 'disable' }).status).toBe(200)
  expect(f.read(id)).toMatchObject({
    enabled: false,
    definition: { selfService: { published: false } },
  })
})
it('fences CAS and exact receipts, rejects fixed parameter drift and never lets a Policy redefine Resource schema', () => {
  const f = fixture(),
    id = f.seed.ids[0]!,
    old = f.read(id),
    operationId = crypto.randomUUID()
  expect(f.write(id, 1, { action: 'disable' }, operationId).status).toBe(200)
  expect(f.write(id, 1, { action: 'disable' }, operationId).status).toBe(200)
  expect(f.write(id, 1, { action: 'enable' }, operationId).status).toBe(409)
  expect(f.write(id, 1, { action: 'enable' }).status).toBe(409)
  const change = (action: unknown) =>
    f.write(id, 2, { action: 'put', enabled: true, definition: { ...old.definition, action } })
  expect(
    change({
      ...old.definition.action,
      parameters: { label: { kind: 'input' }, detail: { kind: 'fixed', value: 10 } },
    }).status,
  ).toBe(400)
  expect(
    change({
      ...old.definition.action,
      parameters: {
        label: { kind: 'input', schema: { type: 'string' } },
        detail: { kind: 'fixed', value: 1 },
      },
    }).status,
  ).toBe(400)
  expect(
    change({
      ...old.definition.action,
      resource: { ...f.seed.definition.action.resource, variant: 'missing' },
    }).status,
  ).toBe(404)
  expect(f.read(id)).toMatchObject({ revision: 2, enabled: false })
})
it('uses UUID cursors and action filtering from the same authoritative collection', () => {
  const f = fixture(),
    first = f.automation.handle(
      f.request(
        '/api/v1/policies',
        undefined,
        new URLSearchParams({ action: 'execution', limit: '2' }),
      ),
      'normal',
    )!.body as { items: PolicyRead[]; nextCursor: string }
  expect(first.items).toHaveLength(2)
  const next = f.automation.handle(
    f.request(
      '/api/v1/policies',
      undefined,
      new URLSearchParams({ after: first.nextCursor, limit: '2' }),
    ),
    'normal',
  )!.body as { items: PolicyRead[]; nextCursor: null }
  expect(next.items).toHaveLength(2)
  expect(next.nextCursor).toBeNull()
  expect(
    f.automation.handle(
      f.request('/api/v1/policies', undefined, new URLSearchParams({ after: 'legacy-cursor' })),
      'normal',
    )?.status,
  ).toBe(400)
})
it('admits only fixed-input Agent check-ins and preserves Unknown runs through later checks and disablement', () => {
  const f = fixture(),
    id = f.seed.ids[0]!,
    old = f.read(id),
    at = f.automation.now() + 1
  expect(
    f.automation.handle(
      f.request(`/api/v1/scopes/${f.seed.scope}`, {
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
        input: {
          action: 'put',
          definition: {
            targets: [{ kind: 'device', id: 'device-01' }],
            limitations: null,
            exclusions: [],
          },
        },
      }),
      'normal',
    )?.status,
  ).toBe(200)
  f.automation.tick({ kind: 'check_in', device: 'device-01', at })
  const executions = () =>
    (
      f.automation.handle(f.request('/api/v1/mdm-candidate/executions'), 'normal')!.body as {
        items: { execution: string; origin: { kind: string; policy?: string } }[]
      }
    ).items.filter((r) => r.origin.kind === 'policy' && r.origin.policy === id)
  expect(executions()).toEqual([])
  const action = {
    ...f.seed.definition.action,
    parameters: { label: { kind: 'fixed', value: 'support' }, detail: { kind: 'fixed', value: 1 } },
    schedule: {
      ...f.seed.definition.action.schedule,
      trigger: { kind: 'check_in', minimumSeconds: 60 },
    },
  }
  expect(
    f.write(id, 1, { action: 'put', enabled: true, definition: { ...old.definition, action } })
      .status,
  ).toBe(200)
  f.automation.tick({ kind: 'clock', at: at + 1 })
  expect(executions()).toEqual([])
  f.automation.tick({ kind: 'check_in', device: 'device-01', at: at + 2 })
  expect(executions()).toHaveLength(1)
  f.automation.tick({ kind: 'check_in', device: 'device-01', at: at + 3 }, 'unknown')
  expect(executions()[0]?.execution).toBe('unknown')
  expect(f.write(id, 2, { action: 'disable' }).status).toBe(200)
  f.automation.tick({ kind: 'check_in', device: 'device-01', at: at + 100 })
  expect(executions()).toHaveLength(1)
  expect(executions()[0]?.execution).toBe('unknown')
})

it('counts actual scope entries rather than Scope configuration revisions and still fences Unknown', () => {
  const devices = createDeviceDemo(),
    automation = createAutomationDemo(devices),
    seed = seedScriptPolicies(automation)
  const scope = automation.scopes.resolve(seed.scope)!,
    id = crypto.randomUUID()
  scope.members = ['device-01']
  const policies = createPolicyDemo(
    devices,
    { resolve: () => structuredClone(scope) },
    automation.resources,
  )
  const definition = {
    ...seed.definition,
    action: {
      ...seed.definition.action,
      frequency: 'once_per_entry',
      parameters: {
        label: { kind: 'fixed', value: 'support' },
        detail: { kind: 'fixed', value: 1 },
      },
      schedule: {
        ...seed.definition.action.schedule,
        trigger: { kind: 'check_in', minimumSeconds: 60 },
      },
    },
  }
  expect(
    policies.handle(
      {
        path: `/api/v1/policies/${id}`,
        method: 'POST',
        body: {
          operationId: crypto.randomUUID(),
          expectedRevision: 0,
          input: { action: 'put', enabled: true, definition },
        },
        actor: { principalId: crypto.randomUUID(), sessionId: crypto.randomUUID() },
        query: new URLSearchParams(),
        headers: {},
      },
      'normal',
    )?.status,
  ).toBe(200)
  let at = automation.now()
  const check = (scenario: 'normal' | 'unknown' = 'normal') =>
    policies.reconcile(scenario, { kind: 'check_in', device: 'device-01', at: (at += 100) })
  check()
  check()
  check()
  expect(policies.executions()[0]?.execution).toBe('succeeded')
  scope.revision++
  check()
  expect(policies.executions()).toHaveLength(1)
  scope.members = []
  policies.reconcile('normal')
  scope.members = ['device-01']
  policies.reconcile('normal')
  check()
  expect(policies.executions()).toHaveLength(2)
  check('unknown')
  scope.members = []
  policies.reconcile('normal')
  scope.members = ['device-01']
  policies.reconcile('normal')
  check()
  expect(policies.executions()).toHaveLength(2)
  expect(policies.executions()[1]?.execution).toBe('unknown')
})

it('gates every-trigger check-ins at 59/60 seconds and fences older events by version and registration', () => {
  const source = createDeviceDemo(),
    automation = createAutomationDemo(source),
    seed = seedScriptPolicies(automation)
  const facts = source.facts(),
    scope = automation.scopes.resolve(seed.scope)!,
    id = crypto.randomUUID()
  scope.members = ['device-01']
  const policies = createPolicyDemo(
    { facts: () => structuredClone(facts) },
    { resolve: () => structuredClone(scope) },
    automation.resources,
  )
  const definition = {
    ...seed.definition,
    action: {
      ...seed.definition.action,
      frequency: 'every_trigger',
      parameters: {
        label: { kind: 'fixed', value: 'support' },
        detail: { kind: 'fixed', value: 1 },
      },
      schedule: {
        ...seed.definition.action.schedule,
        trigger: { kind: 'check_in', minimumSeconds: 60 },
      },
    },
  }
  const write = (definition: unknown, revision = 0) =>
    policies.handle(
      {
        path: `/api/v1/policies/${id}`,
        method: 'POST',
        body: {
          operationId: crypto.randomUUID(),
          expectedRevision: revision,
          input: { action: 'put', enabled: true, definition },
        },
        actor: { principalId: crypto.randomUUID(), sessionId: crypto.randomUUID() },
        headers: {},
        query: new URLSearchParams(),
      },
      'normal',
    )!
  expect(write(definition).status).toBe(200)
  const at = automation.now(),
    check = (offset: number) =>
      policies.reconcile('normal', { kind: 'check_in', device: 'device-01', at: at + offset })
  check(0)
  check(1)
  check(2)
  expect(policies.executions()).toHaveLength(1)
  expect(policies.executions()[0]!.execution).toBe('succeeded')
  check(59)
  expect(policies.executions()).toHaveLength(1)
  check(60)
  expect(policies.executions()).toHaveLength(2)
  check(61)
  check(62)
  check(50)
  expect(policies.executions()).toHaveLength(2)
  expect(
    write({ ...definition, action: { ...definition.action, runLifetimeSeconds: 120 } }, 1).status,
  ).toBe(200)
  check(63)
  expect(policies.executions()).toHaveLength(3)
  check(64)
  check(65)
  const device = facts.find((d) => d.summary.id === 'device-01')!
  device.registrations.filter((r) => r.status === 'active').forEach((r) => r.generation++)
  check(66)
  expect(policies.executions()).toHaveLength(4)
})
