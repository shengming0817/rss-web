import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createScriptDemo } from './scripts'
import { createDeviceDemo } from '../devices/state'
import {
  decodeScriptPlan,
  decodeRun,
  decodeRunPage,
  type ScriptCreate,
} from '../../src/features/policies/clients/scripts'
import type { ResourceRead, ScriptSpec } from '../../src/features/policies/clients/resources'
import type { DemoRequest } from '../scenario'
it('requires an independent authenticated reviewer and retains exact frozen script/run references', () => {
  const devices = createDeviceDemo(),
    author = randomUUID(),
    reviewer = randomUUID()
  const device = devices
    .facts()
    .find(
      (d) => d.summary.platform === 'windows' && d.registrations.some((r) => r.status === 'active'),
    )!
  const definition: ScriptSpec = {
    profile: 'power_shell7',
    runAs: 'system',
    encoding: 'utf8',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    bindings: {},
    output: { type: 'object' },
    purpose: { kind: 'action' },
    timeoutSeconds: 30,
    outputBytes: 1024,
    maxRows: 1,
  }
  const resource: ResourceRead = {
    id: 'script',
    revision: 3,
    kind: 'script',
    versions: [
      {
        id: '1',
        configuration: null,
        digest: Array(32).fill(1),
        state: 'active',
        variants: [
          {
            platform: 'windows',
            architecture: 'x86_64',
            key: 'main',
            declaration: {
              kind: 'script',
              artifact: { reference: 'script-content', length: 10, sha256: Array(32).fill(2) },
              definition,
            },
          },
        ],
      },
    ],
  }
  const scripts = createScriptDemo(devices, { read: () => structuredClone(resource) })
  const operationId = randomUUID()
  const body: ScriptCreate = {
    operationId,
    resource: 'script',
    version: '1',
    platform: 'windows',
    architecture: 'x86_64',
    variant: 'main',
    parameters: {},
    devices: [device.summary.id],
    schedule: {
      trigger: { kind: 'manual' },
      misfire: 'skip',
      notBefore: Math.floor(Date.now() / 1000) - 60,
      until: Math.floor(Date.now() / 1000) + 86400,
      jitterSeconds: 0,
      window: null,
    },
    runLifetimeSeconds: 3600,
  }
  function request(path: string, body?: unknown, principalId = author): DemoRequest {
    return {
      path,
      body,
      method: body === undefined ? 'GET' : 'POST',
      actor: { principalId, sessionId: principalId },
      headers: {},
      query: new URLSearchParams(),
    }
  }
  const created = scripts.handle(request('/api/v3/script-plans', body), 'normal')!
  expect(created.status).toBe(202)
  const id = (created.body as { planId: string }).planId,
    path = `/api/v3/script-plans/${id}`
  expect(
    scripts.handle(request(`${path}/approve`, { operationId: randomUUID() }), 'normal')?.status,
  ).toBe(403)
  expect(
    scripts.handle(request(`${path}/approve`, { operationId: randomUUID() }, reviewer), 'normal')
      ?.status,
  ).toBe(200)
  definition.timeoutSeconds = 60
  expect(
    decodeScriptPlan(scripts.handle(request(path), 'normal')?.body, id).definition.definition
      .timeoutSeconds,
  ).toBe(30)
  const runs = decodeRunPage(scripts.handle(request(`${path}/runs`), 'normal')?.body)
  expect(runs.items).toHaveLength(1)
  const task = runs.items[0]!.taskId
  scripts.handle(request(`${path}/runs/${task}`), 'normal')
  const detail = decodeRun(
    scripts.handle(request(`${path}/runs/${task}`), 'normal')?.body,
    id,
    task,
  )
  expect(detail.result?.diagnostics.stdout).toContain('Synthetic')
  const summary = decodeRunPage(scripts.handle(request(`${path}/runs`), 'normal')?.body).items[0]!
  expect(summary.result).not.toHaveProperty('output')
  expect(summary.result?.diagnostics).not.toHaveProperty('stdout')
  expect(scripts.executions()[0]).toMatchObject({
    id: runs.items[0]!.taskId,
    effect: 'unverified',
    compliance: 'unknown',
  })
  expect(
    scripts.handle(request(`${path}/cancel`, { operationId: randomUUID() }), 'normal')?.status,
  ).toBe(200)
  expect(
    decodeRunPage(scripts.handle(request(`${path}/runs`), 'normal')?.body).items[0]?.state
      .cancellation,
  ).toBe('requested')
})
