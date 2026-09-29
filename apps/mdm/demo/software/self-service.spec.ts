import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createSelfServiceDemo } from './self-service'
import { createSoftwarePolicyDemo } from './assignments'
import { createScopeDemo } from '../policies/scopes'
import { createDeviceDemo } from '../devices/state'
import { softwareResource, operation, request } from './fixtures'
import {
  installationRequest,
  type SelfServiceDefinition,
} from '../../src/features/software/clients/self-service'
function fixture() {
  const devices = createDeviceDemo(),
    scopes = createScopeDemo(devices),
    { resources } = softwareResource()
  resources.handle(
    request('/api/v3/resources/app', operation({ action: 'activate', version: '1' }, 2)),
    'normal',
  )
  let admitted = true
  const admission = { isAdmitted: () => admitted }
  const software = createSoftwarePolicyDemo(
    devices,
    { resolve: scopes.freeze, snapshot: scopes.snapshot },
    resources,
    admission,
  )
  const demo = createSelfServiceDemo(devices, scopes, resources, admission, software)
  const scope = randomUUID(),
    write = operation(
      {
        action: 'put',
        definition: {
          targets: [{ kind: 'device', id: 'device-01' }],
          limitations: null,
          exclusions: [],
        },
      },
      0,
    )
  scopes.handle(request(`/api/v2/scopes/${scope}`, write), 'normal')
  for (let i = 0; i < 2; i++)
    scopes.handle(request(`/api/v2/scopes/${scope}/tasks/${write.operationId}`), 'normal')
  const id = randomUUID(),
    path = `/api/mdm-candidate/v1/software/self-service/items/${id}`
  const definition: SelfServiceDefinition = {
    title: 'Example',
    description: '',
    enabled: true,
    resource: { kind: 'software', id: 'app', version: '1', variants: { windows_x86_64: 'main' } },
    scope,
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
  }
  expect(
    demo.handle(request(path, operation({ action: 'put', definition }, 0)), 'normal')?.status,
  ).toBe(200)
  const queue = () =>
    (
      demo.handle(request('/api/mdm-candidate/v1/software/self-service/requests'), 'normal')!
        .body as { items: unknown[] }
    ).items.map((v) => installationRequest(v))
  return {
    demo,
    software,
    id,
    path,
    definition,
    queue,
    revoke: () => {
      admitted = false
    },
  }
}
it('keeps catalog publication, human approval and local start separate while reusing the native run owner', () => {
  const f = fixture(),
    at = 2000000000
  expect(f.queue()).toEqual([])
  f.demo.tick({ kind: 'software_request', item: f.id, device: 'device-02', at })
  expect(f.queue()).toEqual([])
  f.demo.tick({ kind: 'software_request', item: f.id, device: 'device-01', at })
  f.demo.tick({ kind: 'software_request', item: f.id, device: 'device-01', at })
  expect(f.queue()).toHaveLength(1)
  const r = f.queue()[0]!,
    path = `/api/mdm-candidate/v1/software/self-service/requests/${r.id}`
  f.software.tick({ kind: 'check_in', device: r.device, at }, 'normal')
  expect(f.software.runs.rows()).toHaveLength(0)
  const approval = operation({ action: 'approve', note: 'Business need reviewed' }, r.revision)
  expect(f.demo.handle(request(path, approval), 'normal')?.status).toBe(200)
  expect(f.demo.handle(request(path, approval), 'normal')?.status).toBe(200)
  expect(f.queue()[0]).toMatchObject({
    phase: 'approved',
    policy: { id: expect.any(String) },
    execution: null,
  })
  f.software.tick({ kind: 'check_in', device: r.device, at: at + 1 }, 'normal')
  expect(f.software.runs.rows()).toHaveLength(1)
  expect(f.software.runs.rows()[0]!.value.state.execution).toBe('not_started')
  expect(f.queue()[0]!.execution).toBe(f.software.runs.rows()[0]!.value.taskId)
  f.software.tick({ kind: 'software_start', device: r.device, at: at + 2 }, 'normal')
  expect(f.software.runs.rows()[0]!.value.state.execution).toBe('running')
  expect(
    f.demo.handle(request(path, operation({ action: 'cancel', note: 'Withdrawn' }, 2)), 'normal')
      ?.status,
  ).toBe(200)
  expect(f.software.runs.rows()[0]!.value.state.cancellation).toBe('requested')
  f.software.tick({ kind: 'check_in', device: r.device, at: at + 3 }, 'normal')
  expect(f.software.runs.rows()[0]!.value.state.execution).toBe('unknown')
  expect(f.queue()[0]!.phase).toBe('cancelled')
})
it('rechecks catalog revision and enterprise admission at approval, and retains denied requests', () => {
  const f = fixture(),
    at = 2000000000
  f.demo.tick({ kind: 'software_request', item: f.id, device: 'device-01', at })
  const r = f.queue()[0]!,
    path = `/api/mdm-candidate/v1/software/self-service/requests/${r.id}`
  f.demo.handle(
    request(
      f.path,
      operation({ action: 'put', definition: { ...f.definition, enabled: false } }, 1),
    ),
    'normal',
  )
  expect(
    f.demo.handle(request(path, operation({ action: 'approve', note: 'Review' }, 1)), 'normal')
      ?.status,
  ).toBe(409)
  expect(f.software.runs.rows()).toHaveLength(0)
  expect(
    f.demo.handle(
      request(path, operation({ action: 'deny', note: 'No longer offered' }, 1)),
      'normal',
    )?.status,
  ).toBe(200)
  expect(f.queue()[0]!.phase).toBe('denied')
  expect(
    f.demo.handle(request(path, operation({ action: 'approve', note: 'Review' }, 2)), 'normal')
      ?.status,
  ).toBe(409)
  const other = fixture()
  other.demo.tick({ kind: 'software_request', item: other.id, device: 'device-01', at })
  other.revoke()
  expect(
    other.demo.handle(
      request(
        `/api/mdm-candidate/v1/software/self-service/requests/${other.queue()[0]!.id}`,
        operation({ action: 'approve', note: 'Review' }, 1),
      ),
      'normal',
    )?.status,
  ).toBe(409)
})
