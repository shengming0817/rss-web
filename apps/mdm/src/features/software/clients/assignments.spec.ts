import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import type { SoftwarePolicyDefinition } from './assignment-model'
import { createAssignmentsClient } from './assignments'
import { nativeSchedule, resourceBinding } from '../../policies/clients/model'
const id = '11111111-1111-4111-8111-111111111111',
  versionId = '22222222-2222-4222-8222-222222222222'
const definition: SoftwarePolicyDefinition = {
  scope: id,
  action: {
    delivery: { kind: 'direct' },
    resource: { kind: 'software', id: 'app', version: '1', variants: { windows_x86_64: 'main' } },

    kind: 'software',
    intent: 'required_install',
    admissionOperation: versionId,
    schedule: {
      trigger: { kind: 'check_in', minimumSeconds: 60 },
      misfire: { kind: 'coalesce_one' },
      notBefore: 0,
      until: null,
      jitterSeconds: 0,
      window: null,
    },
    runLifetimeSeconds: 3600,
    rollout: { stages: [{ scope: id, opensAt: 0, minimumVerifiedPercent: null }] },
  },
}
const policy = { id, revision: 1, version: 1, versionId, enabled: true, definition }
it('rejects native schedule and resource coordinates that the service cannot accept', () => {
  const schedule = definition.action.schedule
  for (const trigger of [
    { kind: 'check_in', minimumSeconds: 59 },
    { kind: 'interval', anchor: 0, seconds: 31536001 },
    { kind: 'weekly', zone: 'UTC', weekday: 0, minute: 60 },
    { kind: 'weekly', zone: 'PST', weekday: 1, minute: 1440 },
  ])
    expect(() => nativeSchedule({ ...schedule, trigger })).toThrow()
  expect(() =>
    nativeSchedule({ ...schedule, until: 10, trigger: { kind: 'once', at: 10 } }),
  ).toThrow()
  expect(() =>
    nativeSchedule({
      ...schedule,
      notBefore: 1,
      until: 10,
      trigger: { kind: 'interval', anchor: 0, seconds: 60 },
    }),
  ).toThrow()
  for (const window of [
    { zone: 'UTC', weekdays: [], startMinute: 0, endMinute: 10 },
    { zone: 'UTC', weekdays: [1], startMinute: 10, endMinute: 10 },
  ])
    expect(() => nativeSchedule({ ...schedule, window })).toThrow()
  expect(
    nativeSchedule({
      ...schedule,
      window: { zone: 'Europe/Berlin', weekdays: [1], startMinute: 1320, endMinute: 120 },
    }).window,
  ).not.toBeNull()
  for (const id of ['../app', 'app//name', 'name with spaces', 'a'.repeat(129)])
    expect(() => resourceBinding({ ...definition.action.resource, id })).toThrow()
})
it('consumes the native Policy contract, including optional end and staged software behavior', async () => {
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(policy))
  const client = createAssignmentsClient({ request } as unknown as HttpTransport)
  expect(await client.read(id)).toEqual(policy)
  await client.change(id, {
    operationId: versionId,
    expectedRevision: 1,
    input: { action: 'disable' },
  })
  expect(request.mock.calls[1]![0]).toMatchObject({
    path: '/api/v1/policies/{id}',
    successStatus: 200,
    body: { input: { action: 'disable' } },
  })
})
it('retains native cursor and scope-result fencing across previews', async () => {
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode({
      action: definition.action,
      scopeResult: versionId,
      items: [],
      nextCursor: 'device-20',
    }),
  )
  const client = createAssignmentsClient({ request } as unknown as HttpTransport)
  const page = await client.preview(definition, 'device-01', versionId)
  expect(page.nextCursor).toBe('device-20')
  expect(request.mock.calls[0]![0]).toMatchObject({
    path: '/api/v1/policies/previews',
    body: { definition, after: 'device-01', scopeResult: versionId },
  })
})
it('does not infer full rollout success from reported or waiting-reboot counts', async () => {
  const stage = {
    scope: id,
    opensAt: 0,
    minimumVerifiedPercent: null,
    open: true,
    totalTargets: 10,
    reported: 5,
    unknown: 2,
    waitingUser: 1,
    waitingReboot: 1,
    failed: 1,
    verifiedSuccess: 1,
    unsupportedCapability: 1,
  }
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode({ policyId: id, versionId, paused: false, asOf: 1, stages: [stage] }),
  )
  const result = await createAssignmentsClient({ request } as unknown as HttpTransport).rollout(id)
  expect(result.stages[0]).toEqual(stage)
})

it('rejects changed full preview actions, scope results and retired projection fields', async () => {
  let reply: unknown
  const client = createAssignmentsClient({
    request: async (o: RequestOptions<unknown>) => o.decode(reply),
  } as HttpTransport)
  for (const action of [
    { ...definition.action, intent: 'explicit_uninstall' },
    { ...definition.action, runLifetimeSeconds: 60 },
    { ...definition.action, admissionOperation: id },
    {
      ...definition.action,
      rollout: { stages: [{ scope: versionId, opensAt: 0, minimumVerifiedPercent: null }] },
    },
  ]) {
    reply = { action, scopeResult: versionId, items: [], nextCursor: null }
    await expect(client.preview(definition)).rejects.toThrow('Wrong preview basis')
  }
  reply = { action: definition.action, scopeResult: id, items: [], nextCursor: null }
  await expect(client.preview(definition, 'device-01', versionId)).rejects.toThrow(
    'Wrong preview basis',
  )
  reply = {
    resource: definition.action.resource,
    scopeResult: versionId,
    items: [],
    nextCursor: null,
  }
  await expect(client.preview(definition)).rejects.toThrow()
})
it('retains every operation and diagnosis, including empty arrays, and rejects old device shapes', async () => {
  const row = {
    device: 'device-01',
    assignment: 'eligible',
    taskAdmission: null,
    operationIds: [id, versionId],
    diagnoses: ['conflict', 'remove_pending'],
  }
  let reply: unknown = {
    items: [row, { ...row, device: 'device-02', operationIds: [], diagnoses: [] }],
    nextCursor: null,
  }
  const client = createAssignmentsClient({
    request: async (o: RequestOptions<unknown>) => o.decode(reply),
  } as HttpTransport)
  expect((await client.devices(id)).items).toEqual([
    row,
    { ...row, device: 'device-02', operationIds: [], diagnoses: [] },
  ])
  for (const fields of [
    { operationIds: ['bad'], diagnoses: [] },
    { operationIds: [], diagnoses: [7] },
  ]) {
    reply = { items: [{ ...row, ...fields }], nextCursor: null }
    await expect(client.devices(id)).rejects.toThrow()
  }
  reply = {
    items: [
      {
        device: row.device,
        assignment: row.assignment,
        taskAdmission: null,
        operationId: null,
        diagnosis: null,
      },
    ],
    nextCursor: null,
  }
  await expect(client.devices(id)).rejects.toThrow()
})
