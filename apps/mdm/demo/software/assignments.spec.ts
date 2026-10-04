import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createSoftwarePolicyDemo } from './assignments'
import { createDeviceDemo } from '../devices/state'
import { request, operation, softwareResource } from './fixtures'
import { softwareRun } from '../../src/features/software/clients/runs'
import type { SoftwarePolicyDefinition } from '../../src/features/software/clients/assignment-model'
function setup() {
  const facts = createDeviceDemo().facts(),
    { resources } = softwareResource()
  const saved = resources.read('app')!
  saved.versions[0]!.state = 'active'
  const scope = { id: randomUUID(), revision: 1, members: ['device-01', 'device-02'], sources: [] }
  const snapshot = { result: randomUUID(), devices: [...scope.members] }
  const scopes = new Map<string, typeof scope>([[scope.id, scope]])
  let approved = true
  const owner = createSoftwarePolicyDemo(
    { facts: () => facts },
    {
      resolve: (id) => structuredClone(scopes.get(id) ?? null),
      snapshot: () => structuredClone(snapshot),
    },
    { read: () => saved },
    { isAdmitted: () => approved },
  )
  const definition: SoftwarePolicyDefinition = {
    scope: scope.id,
    action: {
      delivery: { kind: 'direct' },
      resource: { kind: 'software', id: 'app', version: '1', variants: { windows_x86_64: 'main' } },

      kind: 'software',
      intent: 'required_install',
      admissionOperation: randomUUID(),
      schedule: {
        trigger: { kind: 'check_in', minimumSeconds: 60 },
        misfire: { kind: 'coalesce_one' },
        notBefore: 0,
        until: null,
        jitterSeconds: 0,
        window: null,
      },
      runLifetimeSeconds: 3600,
      rollout: { stages: [{ scope: scope.id, opensAt: 0, minimumVerifiedPercent: null }] },
    },
  }
  const id = randomUUID(),
    path = `/api/v1/policies/${id}`
  const put = () =>
    owner.handle(
      request(path, operation({ action: 'put', enabled: true, definition }, 0)),
      'normal',
    )!
  const runs = () =>
    (owner.handle(request(`${path}/runs`), 'normal')!.body as { items: unknown[] }).items.map((v) =>
      softwareRun(v, false),
    )
  return {
    owner,
    saved,
    definition,
    path,
    id,
    put,
    runs,
    facts,
    scope,
    snapshot,
    scopes,
    withdraw: () => {
      approved = false
    },
  }
}
it('previews without creating work, fences scope results and requires explicit software Agent binding', () => {
  const f = setup()
  const preview = () =>
    f.owner.handle(
      request('/api/v1/policies/previews', {
        definition: f.definition,
        scopeResult: f.snapshot.result,
      }),
      'normal',
    )!
  expect(preview().body).toMatchObject({
    items: [
      { device: 'device-01', taskAdmission: { state: 'eligible' } },
      { device: 'device-02', taskAdmission: { state: 'missing_registration' } },
    ],
  })
  expect(f.runs()).toEqual([])
  f.facts[0]!.agentBindings = []
  expect(preview().body).toMatchObject({
    items: [{ taskAdmission: { state: 'missing_registration' } }, {}],
  })
  expect(
    f.owner.handle(
      request('/api/v1/policies/previews', { definition: f.definition, scopeResult: randomUUID() }),
      'normal',
    )?.status,
  ).toBe(409)
})
it('only admits on Agent poll, retains independent delivery and verified result, and respects current approval', () => {
  const f = setup()
  expect(f.put().status).toBe(200)
  const at = 2000000000
  f.owner.tick({ kind: 'clock', at }, 'normal')
  expect(f.runs()).toHaveLength(0)
  f.owner.tick({ kind: 'check_in', device: 'device-01', at }, 'normal')
  expect(f.runs()[0]).toMatchObject({
    state: { delivery: { kind: 'received' }, execution: 'not_started' },
    result: null,
  })
  f.owner.tick({ kind: 'check_in', device: 'device-01', at: at + 1 }, 'normal')
  expect(f.runs()[0]?.state.execution).toBe('running')
  f.owner.tick({ kind: 'check_in', device: 'device-01', at: at + 2 }, 'normal')
  expect(f.runs()[0]).toMatchObject({
    effect: 'verified',
    result: { kind: 'software', detection: 'present' },
  })
  f.owner.tick({ kind: 'check_in', device: 'device-01', at: at + 1000 }, 'normal')
  expect(f.runs()).toHaveLength(1)
  f.withdraw()
  expect(f.owner.handle(request(`${f.path}/devices`), 'normal')?.body).toMatchObject({
    items: [{ taskAdmission: { state: 'approval_withdrawn' } }, {}],
  })
})
it('available installation waits for explicit synthetic local consent; pause never erases unknown effects', () => {
  const f = setup(),
    at = 2000000000
  f.definition.action.intent = 'available_install'
  f.put()
  f.owner.tick({ kind: 'check_in', device: 'device-01', at }, 'normal')
  expect(f.runs()[0]?.userAction).toBe('waiting_user')
  f.owner.tick({ kind: 'check_in', device: 'device-01', at: at + 1 }, 'normal')
  expect(f.runs()[0]?.state.execution).toBe('not_started')
  f.owner.tick({ kind: 'software_start', device: 'device-01', at: at + 2 }, 'normal')
  expect(f.runs()[0]?.state.execution).toBe('running')
  f.owner.handle(request(f.path, operation({ action: 'disable' }, 1)), 'normal')
  expect(f.runs()[0]?.state.cancellation).toBe('requested')
  f.owner.tick({ kind: 'check_in', device: 'device-01', at: at + 3 }, 'normal')
  expect(f.runs()[0]?.state.execution).toBe('unknown')
  f.owner.handle(request(f.path, operation({ action: 'enable' }, 2)), 'normal')
  f.owner.tick({ kind: 'check_in', device: 'device-01', at: at + 1000 }, 'normal')
  expect(f.runs()).toHaveLength(1)
})
it('does not claim that zero exit proves effect and computes rollout from live membership', () => {
  const f = setup(),
    at = 2000000000
  f.put()
  for (let step = 0; step < 3; step++)
    f.owner.tick({ kind: 'check_in', device: 'device-01', at: at + step }, 'unknown')
  expect(f.runs()[0]).toMatchObject({
    effect: 'unknown',
    result: { installerExitCode: 0, detection: 'unknown' },
  })
  const rollout = () => f.owner.handle(request(`${f.path}/software/rollout`), 'normal')!.body
  expect(rollout()).toMatchObject({
    stages: [
      { totalTargets: 2, reported: 1, unknown: 1, verifiedSuccess: 0, unsupportedCapability: 1 },
    ],
  })
  f.scope.members = ['device-02']
  expect(rollout()).toMatchObject({ stages: [{ totalTargets: 1, reported: 0, unknown: 0 }] })
})
it('keeps exact CAS replay and manual policies without a fabricated rerun route', () => {
  const f = setup()
  f.definition.action.schedule.trigger = { kind: 'manual' }
  const body = operation({ action: 'put', enabled: true, definition: f.definition }, 0)
  expect(f.owner.handle(request(f.path, body), 'normal')?.status).toBe(200)
  expect(f.owner.handle(request(f.path, body), 'normal')?.status).toBe(200)
  expect(f.put().status).toBe(409)
  f.owner.tick({ kind: 'check_in', device: 'device-01', at: 2000000000 }, 'normal')
  expect(f.runs()).toEqual([])
  expect(f.owner.handle(request(`${f.path}/reruns`, operation({}, 1)), 'normal')?.status).toBe(400)
})
it('keeps the native semantic version across rollout-only edits and preserves verified evidence', () => {
  const f = setup(),
    at = 2000000000
  const first = f.put().body as { versionId: string; version: number }
  for (let step = 0; step < 3; step++)
    f.owner.tick({ kind: 'check_in', device: 'device-01', at: at + step }, 'normal')
  f.definition.action.rollout.stages[0]!.opensAt = at + 5
  const reply = f.owner.handle(
    request(f.path, operation({ action: 'put', enabled: true, definition: f.definition }, 1)),
    'normal',
  )!
  expect(reply.body).toMatchObject({
    revision: 2,
    versionId: first.versionId,
    version: first.version,
  })
  f.owner.tick({ kind: 'check_in', device: 'device-01', at: at + 100 }, 'normal')
  expect(f.runs()).toHaveLength(1)
  expect(f.runs()[0]!.effect).toBe('verified')
})
it('keeps reboot evidence through pause and checks current authority before accepting later detection', () => {
  const f = setup(),
    at = 2000000000
  f.put()
  for (let step = 0; step < 3; step++)
    f.owner.tick({ kind: 'check_in', device: 'device-01', at: at + step }, 'partial')
  expect(f.runs()[0]).toMatchObject({
    effect: 'waiting_reboot',
    state: { execution: 'waiting_reboot' },
  })
  f.owner.handle(request(f.path, operation({ action: 'disable' }, 1)), 'normal')
  expect(f.runs()[0]?.state.cancellation).toBe('none')
  f.owner.tick({ kind: 'software_reboot', device: 'device-01', at: at + 3 }, 'normal')
  expect(f.runs()[0]?.effect).toBe('unknown')
})
it('opens the next stage only after independent verification and closes the gate for an empty denominator', () => {
  const f = setup(),
    at = 2000000000
  f.scope.members = ['device-01', 'device-07']
  const pilot = { ...f.scope, id: randomUUID(), members: ['device-01'] }
  const broad = { ...f.scope, id: randomUUID(), members: ['device-01', 'device-07'] }
  f.scopes.set(pilot.id, pilot)
  f.scopes.set(broad.id, broad)
  f.definition.action.rollout.stages = [
    { scope: pilot.id, opensAt: 0, minimumVerifiedPercent: null },
    { scope: broad.id, opensAt: 1, minimumVerifiedPercent: 90 },
  ]
  f.put()
  const rollout = () => f.owner.handle(request(`${f.path}/software/rollout`), 'normal')!.body
  expect(rollout()).toMatchObject({
    stages: [
      { totalTargets: 1, open: true },
      { totalTargets: 1, open: false },
    ],
  })
  for (let step = 0; step < 3; step++)
    f.owner.tick({ kind: 'check_in', device: 'device-01', at: at + step }, 'partial')
  expect(rollout()).toMatchObject({
    stages: [{ reported: 1, verifiedSuccess: 0, waitingReboot: 1 }, { open: false }],
  })
  f.owner.tick({ kind: 'software_reboot', device: 'device-01', at: at + 3 }, 'normal')
  expect(rollout()).toMatchObject({ stages: [{ verifiedSuccess: 1 }, { open: true }] })
  pilot.members = []
  expect(rollout()).toMatchObject({
    stages: [{ totalTargets: 0 }, { totalTargets: 2, open: false }],
  })
})

it('rejects uninstall without a declared command before preview or publication, and executes a supported uninstall', () => {
  const f = setup(),
    at = 2000000000
  f.definition.action.intent = 'explicit_uninstall'
  const preview = () =>
    f.owner.handle(request('/api/v1/policies/previews', { definition: f.definition }), 'normal')!
  expect(preview()).toMatchObject({ status: 501, body: { code: 'action_not_supported' } })
  expect(f.put()).toMatchObject({ status: 501, body: { code: 'action_not_supported' } })
  f.owner.tick({ kind: 'check_in', device: 'device-01', at }, 'normal')
  expect(f.runs()).toEqual([])
  const declaration = f.saved.versions[0]!.variants[0]!.declaration
  if (declaration.kind !== 'software') throw new Error('software fixture required')
  declaration.definition.uninstall = structuredClone(declaration.definition.install)
  expect(preview().status).toBe(200)
  expect(f.put().status).toBe(200)
  for (let step = 1; step <= 3; step++)
    f.owner.tick({ kind: 'check_in', device: 'device-01', at: at + step }, 'normal')
  expect(f.runs()).toHaveLength(1)
  expect(f.runs()[0]).toMatchObject({
    effect: 'verified',
    result: { intent: 'uninstall', detection: 'absent' },
  })
})

it('settles unknown only from explicit detection for the original task with current authority', () => {
  const f = setup(),
    at = 2000000000
  f.put()
  for (let step = 0; step < 3; step++)
    f.owner.tick({ kind: 'check_in', device: 'device-01', at: at + step }, 'unknown')
  const run = f.runs()[0]!
  expect(run.effect).toBe('unknown')
  f.owner.tick({ kind: 'check_in', device: 'device-01', at: at + 100 }, 'normal')
  expect(f.runs()[0]?.effect).toBe('unknown')
  f.owner.tick(
    { kind: 'software_detect', device: 'device-01', task: randomUUID(), at: at + 101 },
    'normal',
  )
  expect(f.runs()[0]?.effect).toBe('unknown')
  f.owner.tick(
    { kind: 'software_detect', device: 'device-02', task: run.taskId, at: at + 102 },
    'normal',
  )
  expect(f.runs()[0]?.effect).toBe('unknown')
  f.owner.tick(
    { kind: 'software_detect', device: 'device-01', task: run.taskId, at: at + 103 },
    'normal',
  )
  expect(f.runs()[0]).toMatchObject({
    taskId: run.taskId,
    registrationId: run.registrationId,
    generation: run.generation,
    effect: 'verified',
    state: { delivery: run.state.delivery },
    result: {
      definitionDigest: run.result!.kind === 'software' ? run.result!.definitionDigest : [],
    },
  })
  f.owner.tick({ kind: 'check_in', device: 'device-01', at: at + 200 }, 'normal')
  expect(f.runs()).toHaveLength(1)
})

it('rejects late detection after registration generation changes or cancellation', () => {
  for (const invalidate of ['generation', 'cancel'] as const) {
    const f = setup(),
      at = 2000000000
    f.put()
    for (let step = 0; step < 3; step++)
      f.owner.tick({ kind: 'check_in', device: 'device-01', at: at + step }, 'unknown')
    const run = f.runs()[0]!
    if (invalidate === 'generation')
      f.facts[0]!.registrations.find((r) => r.registrationId === run.registrationId)!.generation++
    else f.owner.handle(request(f.path, operation({ action: 'disable' }, 1)), 'normal')
    f.owner.tick(
      { kind: 'software_detect', device: 'device-01', task: run.taskId, at: at + 100 },
      'normal',
    )
    expect(f.runs()).toHaveLength(1)
    expect(f.runs()[0]?.effect).toBe('unknown')
  }
})
