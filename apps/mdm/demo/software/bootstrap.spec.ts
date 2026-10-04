import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createDeviceDemo } from '../devices/state'
import { createScopeDemo } from '../policies/scopes'
import { createBootstrapDemo } from './bootstrap'
import { operation, request, softwareResource } from './fixtures'
import { createScenario, TENANT } from '../scenario'
import {
  bootstrapPolicy,
  type BootstrapDefinition,
} from '../../src/features/software/clients/bootstrap'
function fixture(direction: 'mdm_to_agent' | 'agent_to_mdm' = 'mdm_to_agent') {
  const devices = createDeviceDemo(),
    facts = devices.facts(),
    scopes = createScopeDemo(devices)
  const { resources } = softwareResource('RSS.DemoAgent')
  resources.handle(
    request('/api/v1/resources/app', operation({ action: 'activate', version: '1' }, 2)),
    'normal',
  )
  const scope = randomUUID(),
    device = direction === 'mdm_to_agent' ? 'device-05' : 'device-09'
  const write = operation(
    {
      action: 'put',
      definition: { targets: [{ kind: 'device', id: device }], limitations: null, exclusions: [] },
    },
    0,
  )
  scopes.handle(request(`/api/v1/scopes/${scope}`, write), 'normal')
  for (let i = 0; i < 2; i++)
    scopes.handle(request(`/api/v1/scopes/${scope}/tasks/${write.operationId}`), 'normal')
  let approved = true
  const demo = createBootstrapDemo({ facts: () => structuredClone(facts) }, scopes, resources, {
    isAdmitted: () => approved,
  })
  demo.tick({ kind: 'clock', at: 2000000000 }, 'normal')
  const id = randomUUID(),
    path = `/api/v1/mdm-candidate/software/bootstrap/${id}`
  const definition: BootstrapDefinition = {
    title: 'Independent source policy',
    scope,
    platform: 'windows',
    enabled: true,
    action:
      direction === 'mdm_to_agent'
        ? {
            kind: 'install_agent',
            resource: {
              kind: 'software',
              id: 'app',
              version: '1',
              variants: { windows_x86_64: 'main' },
            },
            admissionOperation: randomUUID(),
            userAction: 'required',
          }
        : {
            kind: 'request_mdm',
            instructions:
              'Open the operating system enrollment settings and contact your administrator.',
          },
  }
  const change = (input: unknown, revision: number) =>
    demo.handle(request(path, operation(input, revision)), 'normal')!
  expect(change({ action: 'put', definition }, 0).status).toBe(200)
  const read = () =>
    bootstrapPolicy((demo.handle(request(path), 'normal')!.body as { policy: unknown }).policy)
  return {
    demo,
    facts,
    devices,
    scopes,
    resources,
    definition,
    device,
    change,
    read,
    path,
    revoke: () => {
      approved = false
    },
  }
}
it('keeps native installation receipt, detection and Agent registration as independent facts', () => {
  const f = fixture(),
    at = 2000000000
  expect(f.change({ action: 'evaluate' }, 1).status).toBe(200)
  expect(f.read().targets[0]).toMatchObject({
    admission: 'eligible',
    target: null,
    binding: 'missing',
    attempt: null,
  })
  expect(f.change({ action: 'dispatch' }, 2).status).toBe(200)
  f.demo.tick({ kind: 'check_in', device: f.device, at }, 'normal')
  expect(f.read().targets[0]!.attempt).toMatchObject({
    phase: 'waiting_user',
    installation: 'unverified',
  })
  f.demo.tick({ kind: 'bootstrap_continue', device: f.device, at: at + 1 }, 'normal')
  f.demo.tick({ kind: 'check_in', device: f.device, at: at + 2 }, 'normal')
  expect(f.read().targets[0]).toMatchObject({
    target: null,
    binding: 'missing',
    attempt: { phase: 'acknowledged', installation: 'unverified' },
  })
  f.demo.tick({ kind: 'bootstrap_detect', device: f.device, at: at + 3 }, 'normal')
  expect(f.read().targets[0]).toMatchObject({
    target: null,
    binding: 'missing',
    attempt: { installation: 'present' },
  })
  const device = f.facts.find((d) => d.summary.id === f.device)!
  device.registrations.push({
    registrationId: randomUUID(),
    enrollmentId: randomUUID(),
    source: 'agent.builtin',
    status: 'active',
    generation: 1,
  })
  expect(f.read().targets[0]).toMatchObject({
    target: { source: 'agent.builtin' },
    binding: 'missing',
    attempt: { installation: 'present' },
  })
})
it('keeps Agent-origin enrollment guidance separate and never creates MDM registration from acknowledgement', () => {
  const f = fixture('agent_to_mdm'),
    at = 2000000000
  f.change({ action: 'evaluate' }, 1)
  expect(f.read().targets[0]!.source?.source).toBe('agent.builtin')
  f.change({ action: 'dispatch' }, 2)
  f.demo.tick({ kind: 'check_in', device: f.device, at }, 'normal')
  f.demo.tick({ kind: 'bootstrap_continue', device: f.device, at: at + 1 }, 'normal')
  f.demo.tick({ kind: 'check_in', device: f.device, at: at + 2 }, 'normal')
  expect(f.read().targets[0]).toMatchObject({
    target: null,
    binding: 'not_applicable',
    attempt: { kind: 'request_mdm', phase: 'acknowledged', installation: 'not_applicable' },
  })
  expect(
    f.devices
      .facts()
      .find((d) => d.summary.id === f.device)!
      .registrations.some((r) => r.source === 'mdm.windows'),
  ).toBe(false)
})
it('blocks stale source generations and new attempts while installation effect is unknown', () => {
  const f = fixture(),
    at = 2000000000
  f.change({ action: 'evaluate' }, 1)
  f.change({ action: 'dispatch' }, 2)
  const original = f.read().targets[0]!.attempt!
  f.demo.tick({ kind: 'check_in', device: f.device, at }, 'normal')
  f.demo.tick({ kind: 'bootstrap_continue', device: f.device, at: at + 1 }, 'normal')
  f.demo.tick({ kind: 'check_in', device: f.device, at: at + 2 }, 'unknown')
  expect(f.read().targets[0]!.attempt!.phase).toBe('unknown')
  expect(f.change({ action: 'retry', device: f.device }, 3).status).toBe(409)
  expect(f.change({ action: 'reconcile', device: f.device }, 3).status).toBe(200)
  f.demo.tick({ kind: 'bootstrap_detect', device: f.device, at: at + 3 }, 'normal')
  expect(f.read().targets[0]!.attempt).toMatchObject({
    id: original.id,
    phase: 'acknowledged',
    installation: 'present',
  })
  const second = fixture()
  second.change({ action: 'evaluate' }, 1)
  second.change({ action: 'dispatch' }, 2)
  const old = second.read().targets[0]!.attempt!
  second.facts.find((d) => d.summary.id === second.device)!.registrations[0]!.generation++
  second.demo.tick({ kind: 'check_in', device: second.device, at }, 'normal')
  expect(second.read().targets[0]!.attempt).toMatchObject({
    source: { generation: 1 },
    phase: 'failed',
    code: 'source_registration_changed',
  })
  second.facts.find((d) => d.summary.id === second.device)!.bootstrapBindings![0]!.generation++
  expect(second.change({ action: 'retry', device: second.device }, 3).status).toBe(200)
  expect(second.read().targets[0]!.attempt!.source.generation).toBe(2)
  expect(
    second.demo.handle(request(`${second.path}/attempts/${old.id}`), 'normal')!.body,
  ).toMatchObject({ attempt: { source: { generation: 1 }, phase: 'failed' } })
})
it('rejects general software and rechecks enterprise admission without creating native software tasks', () => {
  const f = fixture(),
    { resources } = softwareResource()
  resources.handle(
    request('/api/v1/resources/app', operation({ action: 'activate', version: '1' }, 2)),
    'normal',
  )
  const generic = createBootstrapDemo(f.devices, f.scopes, resources, { isAdmitted: () => true })
  expect(
    generic.handle(
      request(
        `/api/v1/mdm-candidate/software/bootstrap/${randomUUID()}`,
        operation({ action: 'put', definition: f.definition }, 0),
      ),
      'normal',
    )!.status,
  ).toBe(409)
  f.change({ action: 'evaluate' }, 1)
  f.revoke()
  expect(f.read().targets[0]!.admission).toBe('package_unapproved')
  expect(f.change({ action: 'dispatch' }, 2).status).toBe(409)
  expect(f.demo.executions()).toEqual([])
})
it('uses exact HTTP receipts for an unknown dispatch and never falls back from the real source', async () => {
  const f = fixture(),
    scenario = createScenario([f.demo.handle], f.demo.reset)
  f.change({ action: 'evaluate' }, 1)
  const write = operation({ action: 'dispatch' }, 2)
  const login = await scenario.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
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
  const attempt = f.read().targets[0]!.attempt!.id
  scenario.set('normal')
  expect((await scenario.handle('POST', f.path, write, headers)).status).toBe(200)
  expect(f.read().targets[0]!.attempt!.id).toBe(attempt)
  expect(f.demo.executions()).toHaveLength(1)
  await scenario.handle(
    'POST',
    '/api/v1/mdm-candidate/workspace/scenario',
    { scenario: 'normal', module: 'software', source: 'real' },
    headers,
  )
  expect((await scenario.handle('GET', f.path)).status).toBe(503)
})

it.each(['mdm_to_agent', 'agent_to_mdm'] as const)(
  'settles %s deadlines before any late event, and only reconciles the original attempt explicitly',
  (direction) => {
    for (const phase of ['queued', 'waiting_user', 'running'] as const) {
      for (const clockFirst of [false, true]) {
        const f = fixture(direction),
          at = 2000000000
        f.change({ action: 'evaluate' }, 1)
        f.change({ action: 'dispatch' }, 2)
        const original = f.read().targets[0]!.attempt!
        if (phase !== 'queued') f.demo.tick({ kind: 'check_in', device: f.device, at }, 'normal')
        if (phase === 'running')
          f.demo.tick({ kind: 'bootstrap_continue', device: f.device, at: at + 1 }, 'normal')
        if (clockFirst) f.demo.tick({ kind: 'clock', at: original.deadline }, 'normal')
        f.demo.tick(
          {
            kind: phase === 'waiting_user' ? 'bootstrap_continue' : 'check_in',
            device: f.device,
            at: original.deadline,
          },
          'normal',
        )
        expect(f.read().targets[0]!.attempt).toMatchObject({
          id: original.id,
          phase: phase === 'running' ? 'unknown' : 'failed',
          acknowledgedAt: null,
          code: 'deadline_elapsed',
        })
        if (phase === 'running') {
          f.demo.tick(
            { kind: 'bootstrap_detect', device: f.device, at: original.deadline + 1 },
            'normal',
          )
          expect(f.read().targets[0]!.attempt!.phase).toBe('unknown')
          expect(f.change({ action: 'reconcile', device: f.device }, 3).status).toBe(200)
          f.demo.tick(
            { kind: 'bootstrap_detect', device: f.device, at: original.deadline + 2 },
            'normal',
          )
          expect(f.read().targets[0]!.attempt).toMatchObject({
            id: original.id,
            phase: 'acknowledged',
          })
        }
      }
    }
  },
)
