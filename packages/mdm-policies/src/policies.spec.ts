import type { Operation } from '@rss/mdm-inventory'
import type {
  PolicyChange,
  EventRequest,
  PoliciesPort,
  PolicyDefinition,
  PolicyEventsPort,
} from './model'
import { expect, it, vi } from 'vitest'
import {
  createPolicies,
  createPolicyEvents,
  defaultSchedule,
  validateDefinition,
  validateSchedule,
} from './index'

const id = '11111111-1111-4111-8111-111111111111',
  operationId = '22222222-2222-4222-8222-222222222222',
  versionId = '33333333-3333-4333-8333-333333333333'
function definition(): PolicyDefinition {
  return {
    scope: id,
    alias: 'repair.app-1',
    customEvent: 'repair.shared',
    action: {
      kind: 'execution',
      resource: {
        id: 'repair',
        version: 'v1',
        platform: 'windows',
        architecture: 'x86_64',
        variant: 'windows',
      },
      schedule: defaultSchedule(),
      frequency: 'once_per_version',
      runLifetimeSeconds: 3600,
      parameters: {},
    },
  }
}
it('freezes the exact publication intent without equating configuration revision to execution version', async () => {
  const input = definition(),
    change = vi.fn(async (_id: string, request: Operation<PolicyChange>) => {
      expect(Object.isFrozen(request.input)).toBe(true)
      return {
        id,
        revision: 8,
        version: 2,
        versionId,
        state: 'enabled' as const,
        definition: input,
      }
    }),
    policies = createPolicies({ change } as unknown as PoliciesPort)
  const result = await policies.change(id, {
    operationId,
    expectedRevision: 7,
    input: { action: 'put', definition: input, enabled: true },
  })
  expect(result.version).toBe(2)
  expect(result.versionId).toBe(versionId)
  expect(result.revision).toBe(8)
})
it('requires an explicit access basis before publishing while retaining unknown presentation metadata', () => {
  const value = definition(),
    selfService = {
      access: null,
      published: true,
      allowAi: false,
      riskLevel: 1 as const,
      presentation: { displayName: 'Repair', future: { retained: false } },
    }
  expect(() => validateDefinition({ ...value, selfService })).toThrow('explicit access')
  expect(() =>
    validateDefinition({
      ...value,
      selfService: { ...selfService, access: { kind: 'authenticated_user' } },
    }),
  ).not.toThrow()
})
it('keeps all three execution history rules separate and disallows scheduled call-time input', () => {
  const value = definition()
  const action = value.action
  if (action.kind !== 'execution') throw new Error('Expected execution')
  for (const frequency of ['once_per_version', 'once_per_entry', 'every_trigger'] as const)
    expect(() => validateDefinition({ ...value, action: { ...action, frequency } })).not.toThrow()
  expect(() =>
    validateDefinition({
      ...value,
      action: {
        ...action,
        schedule: { ...defaultSchedule(), trigger: { kind: 'check_in', minimumSeconds: 60 } },
        parameters: { path: { kind: 'input' } },
      },
    }),
  ).toThrow('manual')
})
it('requires ordered, distinct rollout stages with no first-stage success gate', () => {
  const action = {
    kind: 'software' as const,
    channel: 'agent' as const,
    delivery: { kind: 'direct' as const },
    resource: {
      kind: 'software' as const,
      id: 'app',
      version: 'v1',
      variants: { windows_x86_64: 'win' },
    },
    intent: 'required_install' as const,
    schedule: defaultSchedule(),
    runLifetimeSeconds: 3600,
    rollout: {
      stages: [
        { scope: id, opensAt: 0, minimumVerifiedPercent: null },
        { scope: versionId, opensAt: 100, minimumVerifiedPercent: 80 },
      ],
    },
  }
  expect(() => validateDefinition({ ...definition(), action })).not.toThrow()
  expect(() =>
    validateDefinition({
      ...definition(),
      action: {
        ...action,
        rollout: { stages: [{ scope: id, opensAt: 0, minimumVerifiedPercent: 80 }] },
      },
    }),
  ).toThrow('order')
  expect(() =>
    validateDefinition({
      ...definition(),
      action: {
        ...action,
        rollout: {
          stages: [
            { scope: id, opensAt: 100, minimumVerifiedPercent: null },
            { scope: versionId, opensAt: 100, minimumVerifiedPercent: null },
          ],
        },
      },
    }),
  ).toThrow('order')
})
it('validates real timezones and window bounds without calculating scheduler state', () => {
  expect(() =>
    validateSchedule({
      ...defaultSchedule(),
      trigger: { kind: 'weekly', zone: 'Europe/London', weekday: 1, minute: 540 },
    }),
  ).not.toThrow()
  expect(() =>
    validateSchedule({
      ...defaultSchedule(),
      trigger: { kind: 'weekly', zone: 'Invalid/Timezone', weekday: 1, minute: 540 },
    }),
  ).toThrow()
  expect(() =>
    validateSchedule({
      ...defaultSchedule(),
      window: { zone: 'UTC', weekdays: [], startMinute: 540, endMinute: 1080 },
    }),
  ).toThrow('window')
})
it('retains original independent event identity and refuses a receipt for another submission', async () => {
  const request: EventRequest = { operationId, event: 'repair.shared', source: { kind: 'human' } },
    submit = vi.fn(async (_device: string, input: EventRequest) => {
      expect(Object.isFrozen(input.source)).toBe(true)
      return { operationId, batchId: versionId, members: 2 }
    }),
    events = createPolicyEvents({ submit } as unknown as PolicyEventsPort)
  await events.submit('endpoint-1', request)
  await events.submit('endpoint-1', request)
  expect(submit).toHaveBeenCalledTimes(2)
  const wrong = createPolicyEvents({
    submit: async () => ({ operationId: id, batchId: versionId, members: 0 }),
  } as unknown as PolicyEventsPort)
  await expect(wrong.submit('endpoint-1', request)).rejects.toThrow('receipt')
})
it('reconciles only the exact original event without replaying a write or equating absence to rejection', async () => {
  const request: EventRequest = { operationId, event: 'repair.shared', source: { kind: 'human' } }
  const submit = vi.fn(),
    lookupOriginal = vi.fn(async () => ({ items: [], nextCursor: null })),
    events = createPolicyEvents({ submit, lookupOriginal } as unknown as PolicyEventsPort)
  expect(await events.original('endpoint-1', request)).toBeNull()
  expect(lookupOriginal).toHaveBeenCalledWith('endpoint-1', operationId)
  expect(submit).not.toHaveBeenCalled()
  const batch = { id: versionId, operationId, event: 'another.event', request }
  const wrong = createPolicyEvents({
    lookupOriginal: async () => ({ items: [batch], nextCursor: null }),
  } as unknown as PolicyEventsPort)
  await expect(wrong.original('endpoint-1', request)).rejects.toThrow('original event')
})
