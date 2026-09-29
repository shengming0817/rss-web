import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createDeviceDemo } from '../devices/state'
import { createScopeDemo } from '../policies/scopes'
import { createUpdatesDemo } from './updates'
import { operation, request, softwareResource } from './fixtures'
import { updateRing, type UpdateDefinition } from '../../src/features/software/clients/updates'
import { createSoftwarePolicyDemo } from './assignments'
import { createScenario, TENANT } from '../scenario'
function fixture(platform: 'windows' | 'macos' = 'windows') {
  const devices = createDeviceDemo(),
    scopes = createScopeDemo(devices),
    scope = randomUUID()
  const put = operation(
    {
      action: 'put',
      definition: {
        targets: (platform === 'windows'
          ? ['device-01', 'device-03', 'device-05']
          : ['device-02', 'device-04', 'device-06']
        ).map((id) => ({ kind: 'device', id })),
        limitations: null,
        exclusions: [],
      },
    },
    0,
  )
  scopes.handle(request(`/api/v2/scopes/${scope}`, put), 'normal')
  for (let i = 0; i < 2; i++)
    scopes.handle(request(`/api/v2/scopes/${scope}/tasks/${put.operationId}`), 'normal')
  const facts = devices.facts(),
    { resources } = softwareResource()
  resources.handle(
    request('/api/v3/resources/app', operation({ action: 'activate', version: '1' }, 2)),
    'normal',
  )
  let approved = true
  const admission = { isAdmitted: () => approved },
    software = createSoftwarePolicyDemo(
      devices,
      { resolve: scopes.freeze, snapshot: scopes.snapshot },
      resources,
      admission,
    )
  const demo = createUpdatesDemo({ facts: () => structuredClone(facts) }, scopes, {
      resources,
      admission,
      software,
    }),
    id = randomUUID()
  const path = `/api/mdm-candidate/v1/software/updates/${id}`
  const definition: UpdateDefinition = {
    title: 'Windows pilot',
    scope,
    platform,
    enabled: true,
    target: { kind: 'os', release: `demo-${platform}-quality-1` },
    deferDays: 0,
    deadline: 2000600000,
    notifyMinutes: 0,
    reboot: 'user',
    window: null,
  }
  const change = (input: unknown, revision: number, scenario = 'normal' as const) =>
    demo.handle(request(path, operation(input, revision)), scenario)!
  expect(change({ action: 'put', definition }, 0).status).toBe(200)
  const read = () =>
    updateRing((demo.handle(request(path), 'normal')!.body as { ring: unknown }).ring)
  return {
    demo,
    devices,
    facts,
    software,
    scopes,
    path,
    definition,
    change,
    read,
    revoke: () => {
      approved = false
    },
  }
}
it('requires independent gap reports, then separates installation, reboot and verification', () => {
  const f = fixture(),
    at = 2000000000
  expect(f.change({ action: 'install' }, 1).status).toBe(409)
  expect(f.change({ action: 'scan' }, 1).status).toBe(200)
  expect(f.read().devices.map((d) => d.gap)).toEqual(['unknown', 'unknown', 'unknown'])
  f.demo.tick({ kind: 'check_in', device: 'device-01', at }, 'normal')
  expect(f.read().devices[0]).toMatchObject({ gap: 'missing', observedAt: at, phase: 'idle' })
  expect(f.read().devices[1]).toMatchObject({ gap: 'unknown', phase: 'unsupported' })
  expect(f.change({ action: 'install' }, 2).status).toBe(200)
  expect(f.read().devices[0]!.phase).toBe('queued')
  f.demo.tick({ kind: 'check_in', device: 'device-01', at: at + 1 }, 'normal')
  expect(f.read().devices[0]!.phase).toBe('downloading')
  f.demo.tick({ kind: 'check_in', device: 'device-01', at: at + 2 }, 'normal')
  expect(f.read().devices[0]!.phase).toBe('installing')
  f.demo.tick({ kind: 'check_in', device: 'device-01', at: at + 3 }, 'normal')
  expect(f.read().devices[0]).toMatchObject({
    phase: 'waiting_reboot',
    gap: 'missing',
    effect: 'unverified',
  })
  f.demo.tick({ kind: 'software_reboot', device: 'device-01', at: at + 4 }, 'normal')
  expect(f.read().devices[0]).toMatchObject({
    phase: 'verified',
    gap: 'installed',
    effect: 'verified',
    observedAt: at + 4,
  })
  expect(f.demo.executions()[0]).toMatchObject({
    effect: 'verified_present',
    compliance: 'unknown',
  })
})
it('keeps unknown effects blocked until independent reconciliation of the original attempt', () => {
  const f = fixture(),
    at = 2000000000
  f.change({ action: 'scan' }, 1)
  f.demo.tick({ kind: 'check_in', device: 'device-01', at }, 'normal')
  f.change({ action: 'install' }, 2)
  for (let n = 1; n <= 3; n++)
    f.demo.tick({ kind: 'check_in', device: 'device-01', at: at + n }, 'unknown')
  expect(f.read().devices[0]!.phase).toBe('unknown')
  expect(f.change({ action: 'install' }, 3).status).toBe(409)
  expect(f.change({ action: 'scan' }, 3).status).toBe(409)
  expect(f.change({ action: 'reconcile', device: 'device-01' }, 3).status).toBe(200)
  expect(f.read().devices[0]!.phase).toBe('reconciling')
  f.demo.tick({ kind: 'check_in', device: 'device-01', at: at + 4 }, 'normal')
  expect(f.read().devices[0]!.phase).toBe('verified')
})
it('waits for notification lead time and requests maintenance reboot without asserting its effect', () => {
  const f = fixture(),
    at = 2000000000
  f.change(
    {
      action: 'put',
      definition: {
        ...f.definition,
        notifyMinutes: 1,
        reboot: 'maintenance',
        window: { zone: 'UTC', weekdays: [1, 2, 3, 4, 5, 6, 7], startMinute: 0, endMinute: 1440 },
      },
    },
    1,
  )
  f.change({ action: 'scan' }, 2)
  f.demo.tick({ kind: 'check_in', device: 'device-01', at }, 'normal')
  f.change({ action: 'install' }, 3)
  f.demo.tick({ kind: 'check_in', device: 'device-01', at: at + 1 }, 'normal')
  expect(f.read().devices[0]).toMatchObject({ phase: 'queued', waiting: 'notification' })
  for (let n = 60; n <= 63; n++)
    f.demo.tick({ kind: 'check_in', device: 'device-01', at: at + n }, 'normal')
  expect(f.read().devices[0]).toMatchObject({
    phase: 'waiting_reboot',
    rebootRequestedAt: at + 63,
    gap: 'missing',
    effect: 'unverified',
  })
  f.demo.tick({ kind: 'software_reboot', device: 'device-01', at: at + 64 }, 'normal')
  expect(f.read().devices[0]!.effect).toBe('verified')
})
it('rejects stale scan evidence and a changed source registration before installation', () => {
  const f = fixture(),
    at = 2000000000
  f.change({ action: 'scan' }, 1)
  f.demo.tick({ kind: 'check_in', device: 'device-01', at }, 'normal')
  f.facts[0]!.registrations.find((r) => r.source === 'mdm.windows')!.generation++
  expect(f.change({ action: 'install' }, 2).status).toBe(409)
  f.facts[0]!.registrations.find((r) => r.source === 'mdm.windows')!.generation--
  f.demo.tick({ kind: 'clock', at: at + 86401 }, 'normal')
  expect(f.change({ action: 'install' }, 2).status).toBe(409)
})
it('creates one managed native software policy for confirmed third-party gaps and protects its ownership', () => {
  const f = fixture(),
    at = 2000000000
  const definition: UpdateDefinition = {
    ...f.definition,
    target: {
      kind: 'third_party',
      resource: { kind: 'software', id: 'app', version: '1', variants: { windows_x86_64: 'main' } },
      admissionOperation: randomUUID(),
    },
  }
  expect(f.change({ action: 'put', definition }, 1).status).toBe(200)
  f.change({ action: 'scan' }, 2)
  f.demo.tick({ kind: 'check_in', device: 'device-01', at }, 'normal')
  const write = operation({ action: 'install' }, 3)
  expect(f.demo.handle(request(f.path, write), 'normal')?.status).toBe(200)
  const policy = f.read().policy!
  expect(policy).not.toBeNull()
  expect(f.demo.handle(request(f.path, write), 'normal')?.status).toBe(200)
  expect(f.read().policy).toEqual(policy)
  expect(
    f.software.handle(
      request(`/api/v2/policies/${policy.id}`, operation({ action: 'disable' }, 1)),
      'normal',
    )?.status,
  ).toBe(403)
  for (let n = 1; n <= 3; n++) {
    f.software.tick({ kind: 'check_in', device: 'device-01', at: at + n }, 'normal')
    f.demo.tick({ kind: 'check_in', device: 'device-01', at: at + n }, 'normal')
  }
  expect(f.read().devices[0]!.execution).toBe(f.software.runs.rows()[0]!.value.taskId)
  expect(f.demo.executions()).toEqual([])
  f.change({ action: 'pause' }, 4)
  expect(f.read().definition.enabled).toBe(false)
})
it('retains failed attempt evidence and retries only a known failure after renewed checks', () => {
  const f = fixture(),
    at = 2000000000
  f.change({ action: 'scan' }, 1)
  f.demo.tick({ kind: 'check_in', device: 'device-01', at }, 'normal')
  f.change({ action: 'install' }, 2)
  for (let n = 1; n <= 3; n++)
    f.demo.tick({ kind: 'check_in', device: 'device-01', at: at + n }, 'partial')
  const original = f.read().devices[0]!
  expect(original.phase).toBe('failed')
  expect(f.change({ action: 'retry', device: original.device }, 3).status).toBe(200)
  expect(f.read().devices[0]!.attempt).not.toBe(original.attempt)
  expect(f.demo.executions()).toHaveLength(2)
  expect(f.demo.executions()[0]).toMatchObject({
    id: original.execution,
    execution: 'failed',
    effect: 'unverified',
  })
})
it('uses shared HTTP session, exact receipts and explicit real-source unavailability', async () => {
  const f = fixture(),
    scenario = createScenario([f.demo.handle], f.demo.reset)
  const write = operation({ action: 'scan' }, 1)
  expect((await scenario.handle('POST', f.path, write)).status).toBe(401)
  const login = await scenario.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const headers = {
    'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
    'x-identity-request': '1',
  }
  expect((await scenario.handle('POST', f.path, write)).status).toBe(403)
  scenario.set('unknown')
  expect((await scenario.handle('POST', f.path, write, headers)).status).toBe(503)
  scenario.set('normal')
  expect((await scenario.handle('GET', f.path)).body).toMatchObject({
    ring: { revision: 2, operation: write.operationId },
  })
  expect((await scenario.handle('POST', f.path, write, headers)).status).toBe(200)
  expect(
    (await scenario.handle('POST', f.path, { ...write, input: { action: 'pause' } }, headers))
      .status,
  ).toBe(409)
  scenario.set('denied')
  expect((await scenario.handle('GET', f.path)).status).toBe(403)
  scenario.set('empty')
  expect(
    (await scenario.handle('GET', '/api/mdm-candidate/v1/software/updates')).body,
  ).toMatchObject({ items: [] })
  await scenario.handle(
    'POST',
    '/api/mdm-candidate/v1/workspace/scenario',
    { scenario: 'normal', module: 'software', source: 'real' },
    headers,
  )
  expect((await scenario.handle('GET', f.path)).status).toBe(503)
})
it('uses the Apple registration and explicit capability for macOS, independently of inventory and Agent presence', () => {
  const f = fixture('macos'),
    at = 2000000000
  expect(f.facts.find((d) => d.summary.id === 'device-02')!.agentBindings).toEqual([])
  f.change({ action: 'scan' }, 1)
  f.demo.tick({ kind: 'check_in', device: 'device-02', at }, 'normal')
  expect(f.read().devices[0]).toMatchObject({
    gap: 'missing',
    registration: { source: 'mdm.apple' },
  })
  expect(f.change({ action: 'install' }, 2).status).toBe(200)
  for (let n = 1; n <= 3; n++)
    f.demo.tick({ kind: 'check_in', device: 'device-02', at: at + n }, 'normal')
  expect(f.read().devices[0]!.phase).toBe('waiting_reboot')
  f.demo.tick({ kind: 'software_reboot', device: 'device-02', at: at + 4 }, 'normal')
  expect(f.read().devices[0]!.effect).toBe('verified')
})
it('pauses delivery without claiming rollback and rejects editing a ring with unresolved effects', () => {
  const f = fixture(),
    at = 2000000000
  f.change({ action: 'scan' }, 1)
  f.demo.tick({ kind: 'check_in', device: 'device-01', at }, 'normal')
  f.change({ action: 'install' }, 2)
  f.demo.tick({ kind: 'check_in', device: 'device-01', at: at + 1 }, 'normal')
  expect(f.change({ action: 'pause' }, 3).status).toBe(200)
  expect(f.read().devices[0]!.phase).toBe('cancel_requested')
  expect(f.change({ action: 'put', definition: f.definition }, 4).status).toBe(409)
  f.demo.tick({ kind: 'check_in', device: 'device-01', at: at + 2 }, 'normal')
  expect(f.read().devices[0]).toMatchObject({ phase: 'unknown', effect: 'unknown' })
})

it.each(['deadline', 'authorization', 'registration', 'cancel'] as const)(
  'keeps pre-delivery %s separate from device receipt',
  (failure) => {
    const f = fixture(),
      at = 2000000000
    f.change({ action: 'scan' }, 1)
    f.demo.tick({ kind: 'check_in', device: 'device-01', at }, 'normal')
    f.change({ action: 'install' }, 2)
    const original = f.read().devices[0]!.execution
    if (failure === 'deadline') f.demo.tick({ kind: 'clock', at: f.definition.deadline }, 'normal')
    else if (failure === 'cancel') f.change({ action: 'pause' }, 3)
    else {
      if (failure === 'authorization') {
        const id = f.definition.scope
        f.scopes.handle(
          request(
            `/api/v2/scopes/${id}`,
            operation(
              {
                action: 'put',
                definition: {
                  targets: [{ kind: 'device', id: 'device-03' }],
                  limitations: null,
                  exclusions: [],
                },
              },
              1,
            ),
          ),
          'normal',
        )
      } else
        f.facts
          .find((d) => d.summary.id === 'device-01')!
          .registrations.find((r) => r.source === 'mdm.windows')!.generation++
      f.demo.tick({ kind: 'check_in', device: 'device-01', at: at + 1 }, 'normal')
    }
    expect(f.demo.executions().find((e) => e.id === original)).toMatchObject({
      dispatch: 'queued',
      receipt: 'not_received',
      execution: failure === 'cancel' ? 'cancelled' : 'failed',
    })
  },
)
it('retains received evidence after installation fails and the ring is rescanned', () => {
  const f = fixture(),
    at = 2000000000
  f.change({ action: 'scan' }, 1)
  f.demo.tick({ kind: 'check_in', device: 'device-01', at }, 'normal')
  f.change({ action: 'install' }, 2)
  const original = f.read().devices[0]!.execution
  for (let n = 1; n <= 3; n++)
    f.demo.tick({ kind: 'check_in', device: 'device-01', at: at + n }, 'partial')
  expect(f.change({ action: 'scan' }, 3).status).toBe(200)
  expect(f.demo.executions().find((e) => e.id === original)).toMatchObject({
    dispatch: 'published',
    receipt: 'received',
    execution: 'failed',
  })
})
