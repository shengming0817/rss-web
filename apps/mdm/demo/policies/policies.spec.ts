import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createPolicyDemo } from './policies'
import { createDeviceDemo } from '../devices/state'
import type { DemoRequest } from '../scenario'
import type { ResourceRead } from '../../src/features/policies/clients/resources'
const path = '/api/mdm-candidate/v1/policies/assignments/firewall'
function fixture() {
  const facts = createDeviceDemo().facts()
  const scope = { id: randomUUID(), revision: 1, members: [] as string[], sources: [] }
  const resource: ResourceRead = {
    id: 'firewall',
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
    { facts: () => structuredClone(facts) },
    { resolve: () => structuredClone(scope) },
    { read: () => structuredClone(resource) },
  )
  const actor = { principalId: randomUUID(), sessionId: randomUUID() }
  const definition = {
    source: 'resource' as const,
    parameters: {},
    resource: 'firewall',
    resourceVersion: '1',
    scope: scope.id,
    enabled: true,
    exitBehavior: 'cancel',
    trigger: { kind: 'on_change' },
    validity: null,
  }
  const request = (url: string, body?: unknown): DemoRequest => ({
    path: url,
    body,
    method: body === undefined ? 'GET' : 'POST',
    actor,
    headers: {},
    query: new URLSearchParams(),
  })
  const write = (
    revision: number,
    input: unknown = { action: 'put', definition },
    operationId = randomUUID(),
  ) => policies.handle(request(path, { operationId, expectedRevision: revision, input }), 'normal')!
  return { policies, scope, resource, facts, definition, request, write }
}
it('enables empty scopes, reconciles membership without changing editing revision and never duplicates unchanged work', () => {
  const f = fixture()
  expect(f.write(0).status).toBe(200)
  expect(f.policies.executions()).toEqual([])
  f.scope.members = ['device-01']
  f.policies.reconcile('normal', { kind: 'clock', at: 2000000000 })
  expect(f.policies.executions()).toHaveLength(1)
  f.policies.reconcile('normal', { kind: 'clock', at: 2000000001 })
  expect(f.policies.executions()).toHaveLength(1)
  expect(f.policies.handle(f.request(path), 'normal')?.body).toMatchObject({
    policy: { revision: 1, computation: { status: 'ready' } },
  })
  f.scope.members = []
  f.policies.reconcile('normal', { kind: 'clock', at: 2000000002 })
  expect(f.policies.executions()[0]?.origin).toMatchObject({ cancellation: 'requested' })
  f.scope.members = ['device-01']
  f.policies.reconcile('normal', { kind: 'clock', at: 2000000003 })
  expect(f.policies.executions()).toHaveLength(2)
})
it('keeps preview side effect free and fences CAS and exact replay', () => {
  const f = fixture(),
    operationId = randomUUID()
  f.scope.members = ['device-01']
  const preview = f.policies.handle(
    f.request(`${path}/preview`, { definition: f.definition }),
    'normal',
  )!
  expect(preview.status).toBe(200)
  expect(f.policies.executions()).toEqual([])
  expect(f.write(0, undefined, operationId).status).toBe(200)
  expect(f.write(0, undefined, operationId).status).toBe(200)
  expect(f.write(0).status).toBe(409)
  expect(
    f.write(1, { action: 'put', definition: { ...f.definition, enabled: false } }, operationId)
      .status,
  ).toBe(409)
  expect(f.policies.executions()).toHaveLength(1)
})
it('blocks individual unsupported members and keeps unknown attempts without blind reruns', () => {
  const f = fixture()
  f.scope.members = ['device-01', 'device-02']
  f.write(0)
  expect(f.policies.executions()).toHaveLength(1)
  f.policies.reconcile('unknown', { kind: 'clock', at: 2000000000 })
  const first = f.policies.executions()[0]!
  expect(first.execution).toBe('unknown')
  f.policies.reconcile('normal', { kind: 'clock', at: 2000000001 })
  expect(f.policies.executions()).toHaveLength(1)
  expect(f.policies.executions()[0]?.execution).toBe('unknown')
  expect(f.policies.handle(f.request(path), 'normal')?.body).toMatchObject({
    policy: {
      members: expect.arrayContaining([
        { device: 'device-02', reason: 'unsupported', execution: null },
      ]),
    },
  })
})
it('changes resource revisions once and fences obsolete device identities', () => {
  const f = fixture()
  f.scope.members = ['device-01']
  f.write(0)
  f.resource.versions.push({ ...f.resource.versions[0]!, id: '2', digest: Array(32).fill(2) })
  expect(
    f.write(1, { action: 'put', definition: { ...f.definition, resourceVersion: '2' } }).status,
  ).toBe(200)
  expect(f.policies.executions()).toHaveLength(2)
  const d = f.facts.find((d) => d.summary.id === 'device-01')!
  d.registrations.forEach((r) => r.generation++)
  f.policies.reconcile('normal', { kind: 'clock', at: 2000000000 })
  expect(f.policies.executions()).toHaveLength(3)
  expect(f.policies.executions().filter((r) => r.execution === 'cancelled')).toHaveLength(2)
})
it('honors interval events, disabled policies and scope re-entry without retrying unknown effects', () => {
  const f = fixture()
  f.scope.members = ['device-01']
  expect(
    f.write(0, {
      action: 'put',
      definition: { ...f.definition, trigger: { kind: 'interval', seconds: 60 } },
    }).status,
  ).toBe(200)
  expect(f.policies.executions()).toHaveLength(0)
  f.policies.reconcile('normal', { kind: 'clock', at: 2000000000 })
  f.policies.reconcile('normal', { kind: 'clock', at: 2000000000 })
  expect(f.policies.executions()).toHaveLength(1)
  f.policies.reconcile('unknown', { kind: 'clock', at: 2000000001 })
  f.policies.reconcile('unknown', { kind: 'clock', at: 2000000002 })
  f.scope.members = []
  f.policies.reconcile('normal', { kind: 'clock', at: 2000000003 })
  f.scope.members = ['device-01']
  f.policies.reconcile('normal', { kind: 'clock', at: 2000000100 })
  expect(f.policies.executions()).toHaveLength(1)
  expect(f.policies.executions()[0]?.execution).toBe('unknown')
})
it('blocks offline and withdrawn identities per member and preserves confirmed results on archive', () => {
  const f = fixture()
  f.scope.members = ['device-01']
  f.write(0)
  f.policies.reconcile('partial', { kind: 'clock', at: 2000000000 })
  expect(f.policies.executions()[0]?.execution).toBe('not_started')
  f.policies.reconcile('normal', { kind: 'clock', at: 2000000001 })
  f.policies.reconcile('normal', { kind: 'clock', at: 2000000002 })
  expect(f.policies.executions()[0]?.execution).toBe('succeeded')
  f.write(1, { action: 'archive' })
  expect(f.policies.executions()[0]).toMatchObject({ execution: 'succeeded', effect: 'unverified' })
  const other = fixture()
  other.scope.members = ['device-01']
  other.write(0)
  other.facts.find((d) => d.summary.id === 'device-01')!.registrations = []
  other.policies.reconcile('normal', { kind: 'clock', at: 2000000001 })
  expect(other.policies.executions()[0]?.execution).toBe('cancelled')
})
