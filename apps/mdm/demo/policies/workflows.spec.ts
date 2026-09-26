import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createWorkflowDemo } from './workflows'
import { createDeviceDemo } from '../devices/state'
import type { WorkflowDefinition, WorkflowRun } from '../../src/features/policies/clients/workflows'
import type { DemoRequest } from '../scenario'
function fixture(approval: boolean, onFailure?: 'continue' | 'approval') {
  const author = randomUUID(),
    reviewer = randomUUID(),
    id = randomUUID(),
    scope = { id: randomUUID(), revision: 1, members: ['device-01'], sources: [] }
  const workflows = createWorkflowDemo(
    createDeviceDemo(),
    { freeze: () => structuredClone(scope) },
    { read: () => null },
    { read: () => null },
  )
  const definition: WorkflowDefinition = {
    name: 'Query',
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
      ...(approval
        ? [
            {
              id: randomUUID(),
              name: 'Review',
              condition: null,
              onFailure: 'stop' as const,
              action: { kind: 'approval' as const },
            },
          ]
        : []),
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
  if (onFailure) {
    definition.steps[0]!.onFailure = onFailure
    definition.steps.push({
      ...structuredClone(definition.steps[0]!),
      id: randomUUID(),
      onFailure: 'stop',
    })
  }
  const path = `/api/mdm-candidate/v1/policies/workflows/${id}`
  function request(url: string, input?: unknown, revision = 0, principalId = author): DemoRequest {
    return {
      path: url,
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
  expect(workflows.handle(request(path, { action: 'put', definition }), 'normal')?.status).toBe(200)
  const start = workflows.handle(request(`${path}/runs`, {}, 1), 'normal')!
  expect(start.status).toBe(202)
  const run = (start.body as { run: WorkflowRun }).run
  return { workflows, scope, path, run, request, reviewer }
}
it('starts ordinary workflows without approval and preserves frozen targets and unknown results', () => {
  const f = fixture(false)
  expect(f.workflows.approvals()).toEqual([])
  f.scope.members.push('device-02')
  const path = `${f.path}/runs/${f.run.id}`
  const unknown = f.workflows.handle(f.request(path), 'unknown')!.body as { run: WorkflowRun }
  expect(unknown.run).toMatchObject({
    state: 'unknown',
    targets: ['device-01'],
    executions: [expect.any(String)],
  })
  expect(
    (f.workflows.handle(f.request(path), 'normal')!.body as { run: WorkflowRun }).run.executions,
  ).toEqual(unknown.run.executions)
})
it('requires a second subject only at an explicit approval step and confirms cancellation on a demo event', () => {
  const f = fixture(true),
    path = `${f.path}/runs/${f.run.id}`
  const waiting = (f.workflows.handle(f.request(path), 'normal')!.body as { run: WorkflowRun }).run
  expect(waiting.approval).toBe('pending')
  expect(f.workflows.approvals()).toHaveLength(1)
  expect(
    f.workflows.handle(f.request(`${path}/approve`, {}, waiting.revision), 'normal')?.status,
  ).toBe(403)
  const approved = f.workflows.handle(
    f.request(`${path}/approve`, {}, waiting.revision, f.reviewer),
    'normal',
  )!
  expect(approved.status).toBe(200)
  const revision = (approved.body as { run: WorkflowRun }).run.revision
  expect(f.workflows.handle(f.request(`${path}/cancel`, {}, revision), 'normal')?.status).toBe(200)
  f.workflows.tick({ kind: 'clock', at: Math.floor(Date.now() / 1000) + 1 })
  expect(
    (f.workflows.handle(f.request(path), 'normal')!.body as { run: WorkflowRun }).run.state,
  ).toBe('cancelled')
  expect(f.workflows.approvals()).toEqual([])
})

it('retains earlier failures after continuing to a successful final step', () => {
  const f = fixture(false, 'continue'),
    path = `${f.path}/runs/${f.run.id}`
  expect(
    (f.workflows.handle(f.request(path), 'partial')!.body as { run: WorkflowRun }).run.state,
  ).toBe('running')
  expect(
    (f.workflows.handle(f.request(path), 'normal')!.body as { run: WorkflowRun }).run.state,
  ).toBe('partial')
})

it('retains failed facts after an explicit approval permits continuation', () => {
  const f = fixture(false, 'approval'),
    path = `${f.path}/runs/${f.run.id}`
  const waiting = (f.workflows.handle(f.request(path), 'partial')!.body as { run: WorkflowRun }).run
  expect(waiting.approval).toBe('pending')
  expect(
    f.workflows.handle(f.request(`${path}/approve`, {}, waiting.revision, f.reviewer), 'normal')
      ?.status,
  ).toBe(200)
  expect(
    (f.workflows.handle(f.request(path), 'normal')!.body as { run: WorkflowRun }).run.state,
  ).toBe('partial')
  const success = fixture(false, 'continue'),
    successPath = `${success.path}/runs/${success.run.id}`
  success.workflows.handle(success.request(successPath), 'normal')
  expect(
    (success.workflows.handle(success.request(successPath), 'normal')!.body as { run: WorkflowRun })
      .run.state,
  ).toBe('completed')
})
