import { expect, it, vi } from 'vitest'
import { createDevices, referenceKey } from './index'
import type { Association, DevicesPort, EndpointDetail, PrimaryRegistration } from './model'

const tenant = '11111111-1111-4111-8111-111111111111',
  operationId = '22222222-2222-4222-8222-222222222222',
  associationId = '33333333-3333-4333-8333-333333333333',
  mdmRegistration = '44444444-4444-4444-8444-444444444444',
  agentRegistration = '55555555-5555-4555-8555-555555555555'
function endpoint(id: string, channel: 'mdm' | 'agent', generation: number): EndpointDetail {
  return {
    id,
    status: 'active',
    primaryMdmRegistration: null,
    inventoryAvailable: false,
    enrollments: [],
    capabilities: [],
    channels: [
      {
        channel,
        registrationId: channel === 'mdm' ? mdmRegistration : agentRegistration,
        generation,
        status: 'active',
        source: channel === 'mdm' ? 'mdm.windows' : 'agent.builtin',
        platform: 'windows',
        lastCommunicationReceivedAt: null,
        children: [],
        userContext: null,
      },
    ],
  }
}
function port(methods: Partial<DevicesPort>): DevicesPort {
  return new Proxy(methods as DevicesPort, {
    get(target, key) {
      if (!(key in target)) throw new Error(`Unexpected port call: ${String(key)}`)
      return Reflect.get(target, key)
    },
  })
}
function receipt(mdm: PrimaryRegistration, agent: PrimaryRegistration, version = 1): Association {
  return {
    id: associationId,
    version,
    state: 'confirmed',
    members: [mdm, agent],
    evidence: 'Verified same hardware',
    confirmedBy: 'operator',
    confirmedAt: 100,
    revokedBy: null,
    revokedAt: null,
    reason: null,
  }
}
it('keeps endpoint and association identity distinct and prepares current registration generations', async () => {
  const read = vi.fn(async (id: string) =>
    endpoint(id, id === 'mdm-endpoint' ? 'mdm' : 'agent', id === 'mdm-endpoint' ? 8 : 3),
  )
  const devices = createDevices(port({ endpoint: read }), tenant)
  const change = await devices.prepareConfirmation(
    operationId,
    'mdm-endpoint',
    'agent-endpoint',
    'Verified same hardware',
  )
  expect(change.associationId).toBeNull()
  expect(change.expectedVersion).toBe(0)
  expect(change.mdm).toEqual({
    device: 'mdm-endpoint',
    channel: 'mdm',
    registrationId: mdmRegistration,
    generation: 8,
  })
  expect(change.agent.generation).toBe(3)
  expect(Object.isFrozen(change)).toBe(true)
  expect(Object.isFrozen(change.mdm)).toBe(true)
  expect(referenceKey({ kind: 'endpoint', id: associationId })).not.toBe(
    referenceKey({ kind: 'association', id: associationId }),
  )
  expect(() => referenceKey({ kind: 'association', id: 'mdm-endpoint' })).toThrow()
})
it('prepares re-verification from full detail and rejects a receipt bound to an old generation', async () => {
  const mdm = {
      device: 'mdm',
      channel: 'mdm' as const,
      registrationId: mdmRegistration,
      generation: 4,
    },
    agent = {
      device: 'agent',
      channel: 'agent' as const,
      registrationId: agentRegistration,
      generation: 2,
    }
  const devices = createDevices(
    port({
      endpoint: async (id) => endpoint(id, id === 'mdm' ? 'mdm' : 'agent', id === 'mdm' ? 4 : 2),
      association: async () => ({ ...receipt(mdm, agent, 7), state: 'needs_verification' }),
      confirm: async () => receipt({ ...mdm, generation: 3 }, agent, 8),
    }),
    tenant,
  )
  const change = await devices.prepareConfirmation(
    operationId,
    'mdm',
    'agent',
    'Verified same hardware',
    associationId,
  )
  expect(change.expectedVersion).toBe(7)
  await expect(devices.confirm(change)).rejects.toThrow('Wrong association receipt')
})
it('does not replay an unknown association write or infer confirmation from a read', async () => {
  const confirm = vi.fn(async () => {
    throw { status: 503, code: 'operation_unknown' }
  })
  const devices = createDevices(
    port({
      endpoint: async (id) => endpoint(id, id === 'mdm' ? 'mdm' : 'agent', 1),
      confirm,
    }),
    tenant,
  )
  const change = await devices.prepareConfirmation(
    operationId,
    'mdm',
    'agent',
    'Verified same hardware',
  )
  await expect(devices.confirm(change)).rejects.toMatchObject({ code: 'operation_unknown' })
  expect(confirm).toHaveBeenCalledTimes(1)
  expect(confirm).toHaveBeenCalledWith(change)
})
it('assigns personnel from the observed CAS detail and rejects a foreign tenant or mismatched receipt', async () => {
  const target = { tenantId: tenant, instanceId: mdmRegistration, principalId: agentRegistration },
    read = vi.fn(async () => ({ revision: 9, user: null }))
  const assign = vi.fn(async () => ({ revision: 10, user: null }))
  const devices = createDevices(port({ registrationUser: read, assign }), tenant)
  await expect(() =>
    devices.prepareAssignment(
      operationId,
      { revision: 9, user: null },
      { ...target, tenantId: associationId },
    ),
  ).toThrow('Wrong personnel tenant')
  expect(read).not.toHaveBeenCalled()
  const change = devices.prepareAssignment(operationId, { revision: 9, user: null }, target)
  expect(change.expectedRevision).toBe(9)
  expect(read).not.toHaveBeenCalled()
  await expect(devices.assign('mdm', change)).rejects.toThrow('Wrong personnel receipt')
  expect(assign).toHaveBeenCalledTimes(1)
})
it('requires two distinct endpoints and bounded human verification evidence', async () => {
  const devices = createDevices(port({ endpoint: async (id) => endpoint(id, 'mdm', 1) }), tenant)
  await expect(
    devices.prepareConfirmation(operationId, 'same', 'same', 'Verified'),
  ).rejects.toThrow()
  await expect(
    devices.prepareConfirmation(operationId, 'mdm', 'agent', '字'.repeat(683)),
  ).rejects.toThrow('Invalid verification text')
  await expect(
    devices.prepareConfirmation(operationId, 'mdm', 'agent', 'bad\u0000evidence'),
  ).rejects.toThrow('Invalid verification text')
})
it('keeps a forced retirement receipt pending and checks its operation binding', async () => {
  const devices = createDevices(
    port({
      forceRetirement: async () => ({
        operationId,
        retirementId: associationId,
        revocation: 'pending',
      }),
    }),
    tenant,
  )
  expect(
    (await devices.forceRetirement(associationId, operationId, 'Recovery approved')).revocation,
  ).toBe('pending')
  await expect(
    devices.forceRetirement(mdmRegistration, operationId, 'Recovery approved'),
  ).rejects.toThrow('Wrong retirement receipt')
})

it('requires the exact MDM capability, current registration and independent permission', async () => {
  const { controlApplicability } = await import('./control-applicability')
  const base = {
    ...endpoint('control-device', 'mdm', 1),
    primaryMdmRegistration: {
      registrationId: '11111111-1111-4111-8111-111111111111',
      generation: 1,
      source: 'mdm.windows' as const,
    },
  }
  const fact = {
    action: 'restart',
    channel: 'mdm',
    productSupport: { state: 'supported' as const, reason: null },
    devicePrerequisite: { state: 'supported' as const, reason: null },
    permission: { allowed: true, reason: null },
  }
  expect(controlApplicability({ ...base, capabilities: [fact] }, 'restart').ready).toBe(true)
  expect(
    controlApplicability({ ...base, capabilities: [{ ...fact, channel: 'agent' }] }, 'restart')
      .ready,
  ).toBe(false)
  expect(
    controlApplicability(
      {
        ...base,
        capabilities: [{ ...fact, permission: { allowed: false, reason: 'permission_denied' } }],
      },
      'restart',
    ).ready,
  ).toBe(false)
  expect(
    controlApplicability(
      {
        ...base,
        capabilities: [
          { ...fact, devicePrerequisite: { state: 'unknown', reason: 'capability_unknown' } },
        ],
      },
      'restart',
    ).ready,
  ).toBe(false)
})
