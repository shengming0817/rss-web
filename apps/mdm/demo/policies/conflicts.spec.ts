import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createAutomationDemo } from './state'
import { createDeviceDemo } from '../devices/state'
import type { DemoRequest } from '../scenario'
it('uses only overlapping enabled assignments when reporting configuration conflicts', () => {
  const automation = createAutomationDemo(createDeviceDemo()),
    actor = { principalId: randomUUID(), sessionId: randomUUID() }
  function request(path: string, body?: unknown): DemoRequest {
    return {
      path,
      body,
      method: body === undefined ? 'GET' : 'POST',
      actor,
      headers: {},
      query: new URLSearchParams(),
    }
  }
  function write(path: string, input: unknown, expectedRevision = 0) {
    const reply = automation.handle(
      request(path, { operationId: randomUUID(), expectedRevision, input }),
      'normal',
    )!
    expect(reply.status).toBe(200)
    return reply.body
  }
  const scopeA = randomUUID(),
    scopeB = randomUUID(),
    a = randomUUID(),
    b = randomUUID()
  for (const [scope, device] of [
    [scopeA, 'device-01'],
    [scopeB, 'device-07'],
  ])
    write(`/api/v2/scopes/${scope}`, {
      action: 'put',
      definition: { targets: [{ kind: 'device', id: device }], limitations: null, exclusions: [] },
    })
  function configuration(id: string, value: boolean) {
    const path = `/api/mdm-candidate/v1/policies/configurations/${id}`
    write(path, { action: 'create', name: id, platform: 'windows', format: 'windows_csp' })
    write(path, { action: 'version', settings: [{ key: 'Camera', value }] }, 1)
    write(path, { action: 'publish', version: 1 }, 2)
  }
  configuration(a, false)
  const definition = (resource: string, scope: string, enabled = true) => ({
    source: 'configuration',
    resource,
    resourceVersion: '1',
    parameters: {},
    scope,
    enabled,
    exitBehavior: 'cancel',
    trigger: { kind: 'on_change' },
    validity: null,
  })
  const pathA = '/api/mdm-candidate/v1/policies/assignments/a',
    pathB = '/api/mdm-candidate/v1/policies/assignments/b'
  write(pathA, { action: 'put', definition: definition(a, scopeA) })
  const reason = () =>
    (
      automation.handle(request(pathA), 'normal')!.body as {
        policy: { members: { reason: string }[] }
      }
    ).policy.members[0]!.reason
  configuration(b, true)
  automation.tick({ kind: 'clock', at: Math.floor(Date.now() / 1000) + 1 })
  expect(reason()).toBe('applicable')
  // Preflight consumes the same effective-assignment set, not the full catalog.
  const scopeRead = automation.handle(request(`/api/v2/scopes/${scopeA}`), 'normal')!.body as {
    revision: number
  }
  const scopeTask = randomUUID()
  const changed = automation.handle(
    request(`/api/v2/scopes/${scopeA}`, {
      operationId: scopeTask,
      expectedRevision: scopeRead.revision,
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
  )!
  expect(changed.status).toBe(200)
  automation.handle(request(`/api/v2/scopes/${scopeA}/tasks/${scopeTask}`), 'normal')
  automation.handle(request(`/api/v2/scopes/${scopeA}/tasks/${scopeTask}`), 'normal')
  const preview = randomUUID(),
    previewPath = `/api/mdm-candidate/v1/policies/configurations/${a}/previews`
  expect(
    automation.handle(
      request(previewPath, {
        operationId: preview,
        expectedRevision: 3,
        input: { version: 1, scope: scopeA },
      }),
      'normal',
    )?.status,
  ).toBe(202)
  automation.handle(request(`${previewPath}/${preview}`), 'normal')
  expect(automation.handle(request(`${previewPath}/${preview}`), 'normal')?.body).toMatchObject({
    preview: {
      rows: [
        {
          device: 'device-01',
          support: 'executable',
          reason: null,
          drift: 'unknown',
          conflicts: [],
        },
      ],
    },
  })

  write(pathB, { action: 'put', definition: definition(b, scopeB) })
  expect(reason()).toBe('applicable')
  write(pathB, { action: 'put', definition: definition(b, scopeA, false) }, 1)
  expect(reason()).toBe('applicable')
  write(pathB, { action: 'put', definition: definition(b, scopeA) }, 2)
  expect(reason()).toBe('conflict')
})
