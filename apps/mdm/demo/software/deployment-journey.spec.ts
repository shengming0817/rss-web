import { expect, it } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createScenario, TENANT } from '../scenario'
import { createDeviceDemo } from '../devices/state'
import { createAutomationDemo } from '../policies/state'
import { createImportsDemo } from './imports'
import { createSoftwareClients } from '../../src/features/software/client'
import { createPolicyClients } from '../../src/features/policies/client'
import { operation } from './fixtures'
it('carries source admission, import, native software Policy and Agent evidence through one HTTP composition', async () => {
  const devices = createDeviceDemo(),
    automation = createAutomationDemo(devices)
  const imports = createImportsDemo(automation.resources, automation.admission)
  const server = createScenario(
    [imports.handle, automation.handle, devices.handle],
    () => {
      devices.reset()
      automation.reset()
      imports.reset()
    },
    automation.tick,
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
  const transport = {
    async request<T>(o: RequestOptions<T>) {
      const path = o.path.replace(/\{([^}]+)\}/g, (_, key: string) =>
        encodeURIComponent(o.pathParams?.[key] ?? ''),
      )
      const query = new URLSearchParams(
        Object.entries(o.query ?? {})
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      )
      const reply = await server.handle(o.method, `${path}?${query}`, o.body, headers)
      if (reply.status !== o.successStatus)
        throw Object.assign(new Error(`${o.method} ${path}: ${JSON.stringify(reply.body)}`), {
          status: reply.status,
        })
      return o.decode(reply.body)
    },
  } as unknown as HttpTransport
  const software = createSoftwareClients(transport, TENANT, true),
    policies = createPolicyClients(transport, TENANT, true)
  await software.admission.changeSource(
    'winget',
    '1',
    operation(
      {
        action: 'register',
        definition: {
          id: 'winget',
          revision: '1',
          kind: 'winget',
          location: 'https://source.example.test',
          publishers: [],
        },
      },
      0,
    ),
  )
  await software.admission.changeSource(
    'winget',
    '1',
    operation({ action: 'approve', evidence: ['synthetic review'] }, 1),
  )
  const resolution = await software.imports.resolve({
    source: 'winget',
    revision: '1',
    package: 'Example.Browser',
    version: '128.0',
    platform: 'windows',
    architecture: 'x86_64',
  })
  const job = crypto.randomUUID()
  await software.imports.change(
    job,
    operation(
      {
        action: 'start',
        resolution: resolution.id,
        resource: 'browser',
        version: 'release-1',
        expectedResourceRevision: 0,
      },
      0,
    ),
  )
  expect((await software.imports.read(job)).status).toBe('completed')
  const approval = await software.admission.changeVersion(
    'browser',
    'release-1',
    operation({ action: 'approve', evidence: ['synthetic acceptance'] }, 0),
  )
  await policies.resources.change(
    'browser',
    operation({ action: 'activate', version: 'release-1' }, 1),
  )
  const scope = crypto.randomUUID(),
    scopeWrite = operation(
      {
        action: 'put' as const,
        definition: {
          targets: [
            { kind: 'device' as const, id: 'device-01' },
            { kind: 'device' as const, id: 'device-02' },
          ],
          limitations: null,
          exclusions: [],
        },
      },
      0,
    )
  await policies.scopes.change(scope, scopeWrite)
  await policies.scopes.status(scope, scopeWrite.operationId)
  await policies.scopes.status(scope, scopeWrite.operationId)
  const id = crypto.randomUUID(),
    definition = {
      resource: {
        kind: 'software' as const,
        id: 'browser',
        version: 'release-1',
        variants: { windows_x86_64: 'main' },
      },
      scope,
      behavior: {
        kind: 'software' as const,
        intent: 'required_install' as const,
        admissionOperation: approval.admission.operation,
        schedule: {
          trigger: { kind: 'check_in' as const, minimumSeconds: 60 },
          misfire: { kind: 'coalesce_one' as const },
          notBefore: 0,
          until: null,
          jitterSeconds: 0,
          window: null,
        },
        runLifetimeSeconds: 3600,
        rollout: { stages: [{ scope, opensAt: 0, minimumVerifiedPercent: null }] },
      },
    }
  const preview = await software.assignments.preview(definition)
  expect(preview.items.map((d) => d.taskAdmission?.state)).toEqual([
    'eligible',
    'missing_registration',
  ])
  expect((await policies.executions.list()).items).toEqual([])
  const body = operation({ action: 'put' as const, enabled: true, definition }, 0)
  server.set('unknown')
  await expect(software.assignments.change(id, body)).rejects.toMatchObject({ status: 503 })
  server.set('normal')
  const stored = await software.assignments.read(id)
  expect(stored.revision).toBe(1)
  expect((await software.assignments.change(id, body)).versionId).toBe(stored.versionId)
  const control = '/api/v1/mdm-candidate/workspace/scenario',
    at = 2000000000
  for (let step = 0; step < 3; step++)
    expect(
      (
        await server.handle(
          'POST',
          control,
          { event: { kind: 'check_in', device: 'device-01', at: at + step } },
          headers,
        )
      ).status,
    ).toBe(204)
  const runs = await software.runs.list(id)
  expect(runs.items).toHaveLength(1)
  expect(runs.items[0]!.result).toMatchObject({
    kind: 'software',
    observedVersion: '128.0',
    effect: 'verified',
  })
  expect(runs.items[0]!.result!.diagnostics).not.toHaveProperty('stdout')
  const task = runs.items[0]!.taskId
  expect((await software.runs.read(id, task)).result!.diagnostics).toHaveProperty('stdout')
  expect(await policies.executions.read(task)).toMatchObject({
    origin: { kind: 'software', policy: id, versionId: stored.versionId },
    effect: 'verified_present',
    compliance: 'unknown',
  })
  expect((await software.assignments.rollout(id)).stages[0]).toMatchObject({
    totalTargets: 2,
    reported: 1,
    verifiedSuccess: 1,
    unsupportedCapability: 1,
  })
  const offering = crypto.randomUUID()
  await software.selfService.changeItem(
    offering,
    operation(
      {
        action: 'put',
        definition: {
          title: 'Browser request',
          description: '',
          enabled: true,
          resource: definition.resource,
          scope,
          admissionOperation: approval.admission.operation,
          schedule: definition.behavior.schedule,
          runLifetimeSeconds: 3600,
        },
      },
      0,
    ),
  )
  await server.handle(
    'POST',
    control,
    { event: { kind: 'software_request', item: offering, device: 'device-01', at: at + 10 } },
    headers,
  )
  const installation = (await software.selfService.requests('pending')).items[0]!
  const approveRequest = operation(
    { action: 'approve' as const, note: 'Reviewed' },
    installation.revision,
  )
  server.set('unknown')
  await expect(software.selfService.decide(installation.id, approveRequest)).rejects.toMatchObject({
    status: 503,
  })
  server.set('normal')
  const approvedRequest = await software.selfService.request(installation.id)
  expect(approvedRequest.operation).toBe(approveRequest.operationId)
  expect((await software.selfService.decide(installation.id, approveRequest)).policy).toEqual(
    approvedRequest.policy,
  )
  const ownedPolicy = await software.assignments.read(approvedRequest.policy!.id)
  await expect(
    software.assignments.change(
      ownedPolicy.id,
      operation({ action: 'disable' }, ownedPolicy.revision),
    ),
  ).rejects.toMatchObject({ status: 403 })
  await expect(
    policies.scopes.change(
      ownedPolicy.definition.scope,
      operation(
        {
          action: 'put',
          definition: {
            targets: [{ kind: 'device', id: 'device-07' }],
            limitations: null,
            exclusions: [],
          },
        },
        1,
      ),
    ),
  ).rejects.toMatchObject({ status: 403 })
  await server.handle(
    'POST',
    control,
    { event: { kind: 'check_in', device: 'device-01', at: at + 11 } },
    headers,
  )
  const offered = await software.selfService.request(installation.id)
  expect(offered.phase).toBe('approved')
  expect((await software.runs.read(ownedPolicy.id, offered.execution!)).userAction).toBe(
    'waiting_user',
  )
  expect((await policies.executions.read(offered.execution!)).waitingReason).toBe('user_action')
  await software.admission.changeSource(
    'winget',
    '1',
    operation({ action: 'withdraw', evidence: ['synthetic withdrawal'] }, 2),
  )
  expect((await software.assignments.devices(id)).items[0]!.taskAdmission?.state).toBe(
    'approval_withdrawn',
  )
  await expect(
    software.assignments.change(id, operation({ action: 'put', enabled: true, definition }, 1)),
  ).rejects.toMatchObject({ status: 409 })
  server.set('denied')
  await expect(software.runs.read(id, task)).rejects.toMatchObject({ status: 403 })
  expect(
    (
      await server.handle(
        'POST',
        control,
        { module: 'software', source: 'real', scenario: 'normal' },
        headers,
      )
    ).status,
  ).toBe(204)
  await expect(software.assignments.read(id)).rejects.toMatchObject({ status: 503 })
})
