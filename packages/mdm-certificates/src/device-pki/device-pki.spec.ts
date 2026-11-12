import { describe, expect, it, vi } from 'vitest'
import {
  createDevicePki,
  validateTrust,
  type DevicePkiPort,
  type Trust,
  type Prepare,
} from './index'
const tenant = '11111111-1111-4111-8111-111111111111',
  service = '22222222-2222-4222-8222-222222222222',
  operation = '33333333-3333-4333-8333-333333333333',
  issuance = '44444444-4444-4444-8444-444444444444'
const trust = (): Trust => ({
  serviceId: service,
  tenant,
  origin: 'https://mdm.example.test',
  purpose: 'agent',
  revision: 1,
  issuers: [
    {
      digest: 'a'.repeat(64),
      mode: 'active',
      certificate: 'YQ==',
      root: 'YQ==',
      crl: 'YQ==',
      rootCrl: 'YQ==',
      provisioner: 'configured-provider',
      kid: '',
    },
  ],
})
function fixture(overrides: Partial<DevicePkiPort> = {}) {
  const port: DevicePkiPort = {
    trust: vi.fn(async () => trust()),
    prepare: vi.fn(async (input) => ({
      operation: input.id,
      revision: input.expectedRevision + 1,
      state: 'distributing' as const,
    })),
    transition: vi.fn(async (input) => ({
      operation: input.id,
      revision: input.expectedRevision + 1,
      state: input.action === 'activate' ? ('activated' as const) : ('retired' as const),
    })),
    publish: vi.fn(async () => {}),
    recoverSigning: vi.fn(async (input) => ({
      attempt: input.attempt,
      fingerprint: 'b'.repeat(64),
    })),
    observation: vi.fn(async () => null),
    registrationRecovery: vi.fn(async () => null),
    recoverRegistration: vi.fn(async (input) => ({
      grantId: issuance,
      state: 'available' as const,
      expiresAt: 1800000000,
      platform: input.platform,
    })),
    recoverIssuance: vi.fn(async (input) => ({
      issuanceId: input.issuance,
      originalSigningOperationId: service,
      certificateChain: input.certificateChain,
      activateBefore: 1800000000,
    })),
    issuanceRecovery: vi.fn(async () => null),
    ...overrides,
  }
  return { port, core: createDevicePki(port, tenant, service) }
}
describe('Device PKI use cases', () => {
  it('keeps loaded public trust separate from a rotation receipt and freezes exact recovery inputs', async () => {
    const { port, core } = fixture(),
      input: Prepare = {
        id: operation,
        purpose: 'agent',
        expectedRevision: 1,
        candidate: { ...trust(), revision: 2 },
      }
    const result = await core.prepare(input)
    expect(result.state).toBe('distributing')
    expect(port.trust).not.toHaveBeenCalled()
    expect(Object.isFrozen(vi.mocked(port.prepare).mock.calls[0]![0].candidate.issuers)).toBe(true)
    expect(await core.trust('agent')).toEqual(trust())
    expect(result).not.toHaveProperty('deviceConfirmed')
  })
  it('does not turn an unknown submission into a read or a new operation', async () => {
    const unknown = new Error('operation_unknown'),
      { port, core } = fixture({
        prepare: vi.fn(async () => {
          throw unknown
        }),
      })
    const input = {
      id: operation,
      purpose: 'agent' as const,
      expectedRevision: 1,
      candidate: { ...trust(), revision: 2 },
    }
    await expect(core.prepare(input)).rejects.toBe(unknown)
    expect(port.prepare).toHaveBeenCalledTimes(1)
    expect(port.trust).not.toHaveBeenCalled()
    await expect(core.prepare(input)).rejects.toBe(unknown)
    expect(vi.mocked(port.prepare).mock.calls.map((call) => call[0])).toEqual([input, input])
  })
  it('rejects wrong tenant/service/purpose and unsupported bootstrap management before writing', async () => {
    const { core, port } = fixture()
    for (const candidate of [
      { ...trust(), tenant: service },
      { ...trust(), serviceId: tenant },
      { ...trust(), purpose: 'windows' as const },
    ]) {
      await expect(
        core.prepare({
          id: operation,
          purpose: 'agent',
          expectedRevision: 1,
          candidate: { ...candidate, revision: 2 },
        }),
      ).rejects.toThrow('binding')
    }
    await expect(core.trust('agent_bootstrap' as 'agent')).rejects.toThrow('purpose')
    expect(port.prepare).not.toHaveBeenCalled()
    expect(port.trust).not.toHaveBeenCalled()
  })
  it('rejects malformed issuer identities and noncanonical public bytes', () => {
    expect(() =>
      validateTrust(
        { ...trust(), issuers: [...trust().issuers, ...trust().issuers] },
        tenant,
        service,
        'agent',
      ),
    ).toThrow('issuer')
    expect(() =>
      validateTrust(
        { ...trust(), issuers: [{ ...trust().issuers[0]!, certificate: 'YR==' }] },
        tenant,
        service,
        'agent',
      ),
    ).toThrow('encoded')
  })
  it('checks operation, phase and exact resulting revision independently', async () => {
    for (const result of [
      { operation: tenant, revision: 2, state: 'activated' as const },
      { operation, revision: 9, state: 'activated' as const },
      { operation, revision: 2, state: 'distributing' as const },
    ]) {
      const { core } = fixture({ transition: vi.fn(async () => result) })
      await expect(
        core.transition({
          id: operation,
          purpose: 'agent',
          expectedRevision: 1,
          action: 'activate',
        }),
      ).rejects.toThrow('receipt')
    }
  })
  it('passes CRL publication completion without manufacturing a device acknowledgement', async () => {
    const { core, port } = fixture()
    expect(
      await core.publish({
        operation,
        purpose: 'agent',
        publications: [{ issuer: 'a'.repeat(64), crl: 'YQ==', rootCrl: 'YQ==' }],
      }),
    ).toBeUndefined()
    expect(port.observation).not.toHaveBeenCalled()
    expect(await core.observation('device-a')).toBeNull()
  })
  it('binds original Windows signing recovery and leaves unknown errors intact', async () => {
    const { core } = fixture({
      recoverSigning: vi.fn(async () => ({ attempt: tenant, fingerprint: 'a'.repeat(64) })),
    })
    await expect(
      core.recoverSigning({ operation, attempt: issuance, chain: ['YQ=='] }),
    ).rejects.toThrow('Windows signing')
  })
  it('does not confuse the administrative recovery ID with the original signing ID', async () => {
    const { core, port } = fixture()
    const result = await core.recoverIssuance({
      issuance,
      operationId: operation,
      certificateChain: ['YQ=='],
    })
    expect(result.originalSigningOperationId).toBe(service)
    const found = { ...result, originalSigningOperationId: tenant }
    vi.mocked(port.issuanceRecovery).mockResolvedValue(found)
    expect(await core.issuanceRecovery(issuance, operation)).toEqual(found)
    expect(port.issuanceRecovery).toHaveBeenCalledWith(issuance, operation)
  })
  it('passes a bootstrap secret only as transient submission input', async () => {
    const { core, port } = fixture(),
      secret = 'A'.repeat(43)
    await core.recoverRegistration(
      {
        device: 'device-a',
        operationId: operation,
        platform: 'windows',
        csr: 'YQ==',
        secret,
      } as Parameters<typeof core.recoverRegistration>[0],
      secret,
    )
    const [intent, supplied] = vi.mocked(port.recoverRegistration).mock.calls[0]!
    expect(intent).not.toHaveProperty('secret')
    expect(supplied).toBe(secret)
    expect(Object.isFrozen(intent)).toBe(true)
  })
})
