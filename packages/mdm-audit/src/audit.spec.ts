import { expect, it, vi } from 'vitest'
import {
  createAudit,
  createAuditPolicyLookup,
  validateActivityQuery,
  validateAuditQuery,
} from './index'
import type { ActivityDetail, AuditPolicyIdentity, AuditPort, AuditPolicyLookupPort } from './index'
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222'
const identity: AuditPolicyIdentity = {
  id,
  toolName: 'policy_' + id.replaceAll('-', ''),
  alias: 'fleet.check',
  customEvent: 'daily.check',
  state: 'enabled',
  revision: 3,
  versionId: other,
}
it('keeps recorded-time and opaque snapshot context without mixing path and query device', async () => {
  const query = {
      from: 10,
      until: 20,
      operationId: id,
      cursor: 'opaque',
      actor: 'principal',
      limit: 1,
    },
    timeline = vi
      .fn<AuditPort['timeline']>()
      .mockResolvedValue({ items: [], nextCursor: null, coverage: { complete: false } }),
    core = createAudit({ timeline } as unknown as AuditPort)
  await core.timeline('known-device-without-inventory-preflight', query)
  expect(timeline).toHaveBeenCalledWith('known-device-without-inventory-preflight', query)
  expect(Object.isFrozen(timeline.mock.calls[0]![1])).toBe(true)
  expect(() =>
    core.timeline('device', { ...query, device: 'other' } as unknown as Parameters<
      typeof core.timeline
    >[1]),
  ).toThrow()
  expect(() => validateAuditQuery({ ...query, until: 10 })).toThrow()
  expect(() =>
    validateAuditQuery({ ...query, operationId: '00000000-0000-0000-0000-000000000000' }),
  ).toThrow()
  expect(() => validateAuditQuery({ ...query, limit: 201 })).toThrow()
  expect(() =>
    validateActivityQuery({
      operation: id,
      policy: other,
      related: 'execution:fact',
      from: 1,
      until: 2,
    }),
  ).not.toThrow()
})
it('accepts an authorized paired member but rejects another activity identity or personal projection', async () => {
  const detail: ActivityDetail = {
    activity: {
      id: 'fact:1',
      source: 'native',
      kind: 'execution',
      phase: 'received',
      recordedAt: 20,
      observedAt: 10,
      origin: 'policy',
      target: { device: 'paired-channel', registration: id, generation: 2 },
      links: {
        policy: id,
        version: other,
        batch: null,
        member: null,
        request: null,
        operation: other,
        retirement: null,
        task: null,
        attempt: null,
        steps: [],
        operations: [{ kind: 'native', id: other }],
      },
      delivery: 'received',
      execution: 'received',
      effect: 'unverifiable',
      reporting: null,
      decision: null,
      auditOutcome: 'succeeded',
    },
    personal: false,
    related: [],
    relatedCursor: null,
    missing: ['not_retained'],
    asOf: 21,
  }
  const activity = vi.fn<AuditPort['activity']>().mockResolvedValue(detail),
    core = createAudit({ activity } as unknown as AuditPort)
  expect((await core.activity('path-channel', 'fact:1')).activity.target?.device).toBe(
    'paired-channel',
  )
  expect((await core.activity('path-channel', 'fact:1')).activity.effect).toBe('unverifiable')
  await expect(core.activity('path-channel', 'fact:another')).rejects.toThrow()
  activity.mockResolvedValue({ ...detail, personal: true } as unknown as ActivityDetail)
  await expect(core.activity('path-channel', 'fact:1')).rejects.toThrow()
})
it('resolves exact current addresses and retains a shared event as a multiple-policy association', async () => {
  const resolve = vi.fn<AuditPolicyLookupPort['resolve']>().mockResolvedValue(identity),
    byEvent = vi
      .fn<AuditPolicyLookupPort['byEvent']>()
      .mockResolvedValue({ items: [identity, { ...identity, id: other }], nextCursor: 'next' }),
    core = createAuditPolicyLookup({ resolve, byEvent })
  expect(await core.resolve({ kind: 'alias', alias: 'FLEET.CHECK' })).toEqual(identity)
  expect(await core.resolve({ kind: 'tool_name', name: identity.toolName })).toEqual(identity)
  await expect(core.resolve({ kind: 'id', id: other })).rejects.toThrow()
  expect((await core.byEvent('daily.check')).items).toHaveLength(2)
  byEvent.mockResolvedValue({
    items: [{ ...identity, customEvent: 'different' }],
    nextCursor: null,
  })
  await expect(core.byEvent('daily.check')).rejects.toThrow()
  await expect(core.resolve({ kind: 'alias', alias: 'invalid alias' })).rejects.toThrow()
})

it('requires the original self-service actor and rejects a browser instance coordinate', async () => {
  const { validateOperationAddress } = await import('./operation-diagnostics')
  const address = {
    owner: 'script_invocation',
    operationId: '11111111-1111-4111-8111-111111111111',
    device: 'endpoint',
    registration: '22222222-2222-4222-8222-222222222222',
    generation: 1,
  }
  expect(() => validateOperationAddress(address)).toThrow('Missing required operation coordinate')
  const locator = { ...address, actor: 'registered-user' }
  expect(() => validateOperationAddress(locator)).not.toThrow()
  expect(() => validateOperationAddress({ ...locator, instance: address.operationId })).toThrow(
    'Self-service invocation has no instance coordinate',
  )
})
