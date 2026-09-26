import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createWorkflowDemo } from './workflows'
import { createDeviceDemo } from '../devices/state'
import type { WorkflowDefinition } from '../../src/features/policies/clients/workflows'
import type { DemoRequest } from '../scenario'
it('freezes workflow targets, enforces independent approval, and retains unknown effects after cancellation', () => {
  const devices = createDeviceDemo(),
    author = randomUUID(),
    reviewer = randomUUID(),
    id = randomUUID()
  const scope = {
    id: randomUUID(),
    revision: 1,
    members: [devices.facts()[0]!.summary.id],
    sources: [],
  }
  const workflows = createWorkflowDemo(
    devices,
    { freeze: () => structuredClone(scope) },
    { read: () => null },
    { read: () => null },
  )
  const definition: WorkflowDefinition = {
    name: 'Inventory review',
    scope: scope.id,
    schedule: {
      trigger: { kind: 'manual' },
      misfire: 'skip',
      notBefore: Math.floor(Date.now() / 1000) - 60,
      until: Math.floor(Date.now() / 1000) + 86400,
      jitterSeconds: 0,
      window: null,
    },
    steps: [
      {
        id: randomUUID(),
        name: 'Collect',
        condition: null,
        onFailure: 'stop',
        action: {
          kind: 'query',
          sql: 'select version from osquery_info;',
          mappings: [{ field: 'custom.osquery.version', pointer: '/0/version' }],
        },
      },
    ],
  }
  const path = `/api/mdm-candidate/v1/policies/workflows/${id}`
  function request(path: string, input?: unknown, revision = 0, principalId = author): DemoRequest {
    return {
      path,
      method: input === undefined ? 'GET' : 'POST',
      body:
        input === undefined
          ? undefined
          : { operationId: randomUUID(), expectedRevision: revision, input },
      actor: { principalId, sessionId: principalId },
      headers: {},
      query: new URLSearchParams(),
    }
  }
  definition.steps.push({
    ...structuredClone(definition.steps[0]!),
    id: randomUUID(),
    name: 'Second step',
  })
  expect(workflows.handle(request(path, { action: 'put', definition }), 'normal')?.status).toBe(200)
  const started = workflows.handle(request(`${path}/runs`, {}, 1), 'normal')!
  expect(started.status).toBe(202)
  const run = (started.body as { run: { id: string } }).run.id
  scope.members.push('device-02')
  expect(workflows.handle(request(`${path}/runs/${run}/approve`, {}, 1), 'normal')?.status).toBe(
    403,
  )
  expect(
    workflows.handle(request(`${path}/runs/${run}/approve`, {}, 1, reviewer), 'normal')?.status,
  ).toBe(200)
  const read = workflows.handle(request(`${path}/runs/${run}`), 'normal')!
  expect(read.body).toMatchObject({
    run: { targets: [scope.members[0]], executions: [expect.any(String)] },
  })
  expect(workflows.executions()[0]).toMatchObject({ effect: 'unverified', compliance: 'unknown' })
  const revision = (read.body as { run: { revision: number } }).run.revision
  expect(
    workflows.handle(request(`${path}/runs/${run}/cancel`, {}, revision), 'normal')?.status,
  ).toBe(200)
  expect(workflows.executions()[0]?.effect).toBe('unverified')
  expect(
    workflows.handle(request(`${path}/runs/${run}/cancel`, {}, revision + 1), 'normal')?.status,
  ).toBe(409)
  const uncertain = workflows.handle(request(`${path}/runs`, {}, 1), 'normal')!
  const uncertainId = (uncertain.body as { run: { id: string } }).run.id
  workflows.handle(request(`${path}/runs/${uncertainId}/approve`, {}, 1, reviewer), 'normal')
  expect(workflows.handle(request(`${path}/runs/${uncertainId}`), 'unknown')?.body).toMatchObject({
    run: { state: 'unknown', executions: scope.members.map(() => expect.any(String)) },
  })
  expect(workflows.handle(request(`${path}/runs/${uncertainId}`), 'normal')?.body).toMatchObject({
    run: { state: 'unknown', executions: scope.members.map(() => expect.any(String)) },
  })
  const terminal = workflows.handle(request(`${path}/runs`, {}, 1), 'normal')!
  const terminalId = (terminal.body as { run: { id: string } }).run.id
  workflows.handle(request(`${path}/runs/${terminalId}/approve`, {}, 1, reviewer), 'normal')
  workflows.handle(request(`${path}/runs/${terminalId}`), 'normal')
  const completed = workflows.handle(request(`${path}/runs/${terminalId}`), 'normal')!
  expect(completed.body).toMatchObject({ run: { state: 'completed' } })
  expect(
    workflows.handle(
      request(
        `${path}/runs/${terminalId}/cancel`,
        {},
        (completed.body as { run: { revision: number } }).run.revision,
      ),
      'normal',
    )?.status,
  ).toBe(409)
})
