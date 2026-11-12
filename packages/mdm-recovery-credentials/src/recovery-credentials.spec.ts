import { describe, expect, it, vi } from 'vitest'
import {
  createRecoveryCredentials,
  credentialIntent,
  disclosureKey,
  readable,
  revokePermission,
  type CredentialOperation,
  type FileVaultConfiguration,
  type Material,
  type OperationIntent,
  type RecoveryCredentialsPort,
  type Subject,
} from './index'
const id = '11111111-1111-4111-8111-111111111111',
  operationId = '22222222-2222-4222-8222-222222222222',
  registration = '33333333-3333-4333-8333-333333333333',
  custody = '44444444-4444-4444-8444-444444444444',
  device = 'device-a'
const target = { device, id, version: 2 }
const material = (subject: Subject = { kind: 'recovery_lock' }): Material => ({
  id,
  version: 2,
  binding: { device, subject },
  current: true,
  validity: 'unverified',
  escrowed: true,
  operation: operationId,
  createdAt: 1700000000,
  invalidatedAt: null,
})
const config = (): FileVaultConfiguration => ({
  enabled: true,
  revision: 6,
  custodyId: custody,
  custodyEpoch: 8,
  recipientId: 'escrow-recipient',
  recipientCertificate: 'public certificate',
  materialRevision: 12,
})
const intent = (): OperationIntent => ({
  device,
  operationId,
  deadline: 1800000000,
  action: { kind: 'collect_filevault', expectedRevision: 12, recipient: null },
})
const operation = (): CredentialOperation => ({
  operationId,
  commandId: operationId,
  revision: 1,
  inputVersion: 'recovery-credential/v1',
  deadline: 1800000000,
  task: 'SecurityInfo',
  commandStatus: 'received',
  authorization: 'authorized',
  authorizationReason: null,
  dispatchFailure: null,
  observation: {
    scope: 'native_command',
    progress: 'received',
    effect: 'unverified',
    result: null,
    receipts: [{ phase: 'execute', state: 'sent', receivedAt: null, accepted: false }],
  },
})
function fixture(overrides: Partial<RecoveryCredentialsPort> = {}) {
  const port: RecoveryCredentialsPort = {
    list: vi.fn(async () => ({ items: [material()], nextCursor: null })),
    material: vi.fn(async () => material()),
    configuration: vi.fn(async () => config()),
    configure: vi.fn(async (inputDevice) => {
      expect(inputDevice).toBe(device)
      return config()
    }),
    link: vi.fn(async () => config()),
    reveal: vi.fn(async () => ({ material: material(), secret: 'synthetic-secret' })),
    beginLoginDisclosure: vi.fn(async () => ({
      id: operationId,
      publicKey: { challenge: 'public challenge' },
    })),
    revealLogin: vi.fn(async () => ({
      material: material({
        kind: 'rss_login',
        binding: id,
        bindingGeneration: 2,
        sid: 'S-1-5-21-1-2-3-1001',
      }),
      secret: 'A'.repeat(43),
    })),
    revoke: vi.fn(async () => ({ ...material(), validity: 'revoked' as const })),
    create: vi.fn(async (input) => ({
      operationId: input.operationId,
      commandId: input.operationId,
      revision: 1,
      accepted: true as const,
    })),
    operation: vi.fn(async () => operation()),
    ...overrides,
  }
  return { port, core: createRecoveryCredentials(port) }
}
describe('Recovery credentials', () => {
  it.each<Subject>([
    { kind: 'rss_login', binding: id, bindingGeneration: 2, sid: 'S-1-5-21-1-2-3-1001' },
    { kind: 'bitlocker', volume: 'volume-identity', protector: id },
    { kind: 'local_administrator', sid: 'S-1-5-21-1-2-3-500' },
    { kind: 'filevault', custody, epoch: 8 },
    { kind: 'recovery_lock' },
    { kind: 'lock_pin', operation: operationId },
  ])('retains exact identity and independent revoke permission for $kind', async (subject) => {
    const { core } = fixture({ material: vi.fn(async () => material(subject)) })
    expect((await core.material(target)).binding.subject).toEqual(subject)
    expect(revokePermission(subject)).toBe(
      subject.kind === 'rss_login' || subject.kind === 'local_administrator'
        ? 'account_write'
        : subject.kind === 'lock_pin'
          ? 'device_control'
          : 'security_operate',
    )
  })
  it('does not conflate current status, validity evidence and escrow availability', () => {
    expect(readable({ ...material(), validity: 'unknown', current: false })).toBe(true)
    expect(readable({ ...material(), validity: 'verified', escrowed: false })).toBe(false)
    expect(readable({ ...material(), validity: 'superseded' })).toBe(false)
    expect(readable({ ...material(), validity: 'revoked' as const })).toBe(false)
  })
  it('keeps FileVault configuration revision, material revision, custody epoch and transport generation independent', async () => {
    const { core, port } = fixture()
    expect(await core.configuration(device)).toEqual(config())
    await core.configure(device, {
      operationId,
      expectedRevision: 5,
      enabled: true,
      recipientId: 'escrow-recipient',
    })
    expect(port.configure).toHaveBeenCalledWith(device, {
      operationId,
      expectedRevision: 5,
      enabled: true,
      recipientId: 'escrow-recipient',
    })
    await core.create(intent())
    expect(vi.mocked(port.create).mock.calls[0]![0].action).toMatchObject({ expectedRevision: 12 })
  })
  it('allows collection revocation without depending on a usable recipient', async () => {
    const { core } = fixture({
      configure: vi.fn(async () => ({
        ...config(),
        enabled: false,
        recipientId: null,
        recipientCertificate: null,
      })),
    })
    expect(
      await core.configure(device, {
        operationId,
        expectedRevision: 5,
        enabled: false,
        recipientId: '',
      }),
    ).toMatchObject({ enabled: false, recipientId: null })
  })
  it('does not retry configuration CAS conflicts or silently replace the revision', async () => {
    const conflict = new Error('operation_conflict'),
      { core, port } = fixture({
        configure: vi.fn(async () => {
          throw conflict
        }),
      })
    await expect(
      core.configure(device, {
        operationId,
        expectedRevision: 5,
        enabled: true,
        recipientId: 'escrow-recipient',
      }),
    ).rejects.toBe(conflict)
    expect(port.configure).toHaveBeenCalledTimes(1)
    expect(port.configuration).not.toHaveBeenCalled()
  })
  it('rejects wrong FileVault receipt revision and wrong member selection', async () => {
    const { core, port } = fixture()
    await expect(
      core.configure(device, {
        operationId,
        expectedRevision: 6,
        enabled: true,
        recipientId: 'escrow-recipient',
      }),
    ).rejects.toThrow('receipt')
    await expect(core.link(device, operationId, device)).rejects.toThrow('distinct')
    expect(port.link).not.toHaveBeenCalled()
    await core.link(device, operationId, 'associated-device-b')
    expect(port.link).toHaveBeenCalledWith(device, operationId, 'associated-device-b')
  })
  it('keeps disclosure authority independent of inventory reads and uses only the formal RSS Login routes', async () => {
    const forbidden = { status: 403, code: 'permission_denied' },
      { core, port } = fixture({
        reveal: vi.fn(async () => {
          throw forbidden
        }),
      })
    await expect(core.reveal(target)).rejects.toBe(forbidden)
    expect(port.material).not.toHaveBeenCalled()
    const input = { operationId, target }
    expect(await core.beginLoginDisclosure(input)).toEqual({
      id: operationId,
      publicKey: { challenge: 'public challenge' },
    })
    expect(port.beginLoginDisclosure).toHaveBeenCalledWith(input, undefined)
    expect(port.revealLogin).not.toHaveBeenCalled()
    expect(await core.revealLogin(input)).toMatchObject({
      material: { binding: { subject: { kind: 'rss_login' } } },
    })
    expect(port.material).not.toHaveBeenCalled()
    expect(disclosureKey(input)).not.toBe(disclosureKey({ ...input, operationId: id }))
    expect(disclosureKey(input)).not.toBe(
      disclosureKey({ ...input, target: { ...target, version: 3 } }),
    )
  })
  it('preserves the backend rejection of wrong-purpose material and performs no inventory preflight', async () => {
    const forbidden = { status: 403, code: 'permission_denied' },
      { core, port } = fixture({
        beginLoginDisclosure: vi.fn(async () => {
          throw forbidden
        }),
      })
    await expect(core.beginLoginDisclosure({ operationId, target })).rejects.toBe(forbidden)
    expect(port.material).not.toHaveBeenCalled()
    expect((await core.reveal(target)).secret).toBe('synthetic-secret')
    expect(port.material).not.toHaveBeenCalled()
  })
  it('checks returned device, material, exact version and late cancellation', async () => {
    for (const wrong of [
      { ...material(), id: operationId },
      { ...material(), version: 3 },
      { ...material(), binding: { ...material().binding, device: 'other-device' } },
    ]) {
      const { core } = fixture({
        reveal: vi.fn(async () => ({ material: wrong, secret: 'synthetic' })),
      })
      await expect(core.reveal(target)).rejects.toThrow('exact')
    }
    const controller = new AbortController(),
      { core } = fixture({
        reveal: vi.fn(async () => {
          controller.abort()
          return { material: material(), secret: 'synthetic' }
        }),
      })
    await expect(core.reveal(target, controller.signal)).rejects.toThrow('cancelled')
  })
  it('keeps rotation password out of the frozen operation and requires it only for rotation submission', async () => {
    const { core, port } = fixture(),
      input = {
        ...intent(),
        action: {
          kind: 'rotate_filevault' as const,
          expectedRevision: 12,
          unlockPassword: 'should not survive',
        },
        secret: 'should not survive',
      }
    const frozen = credentialIntent(input)
    expect(frozen).not.toHaveProperty('secret')
    expect(frozen.action).not.toHaveProperty('unlockPassword')
    await expect(core.create(frozen)).rejects.toThrow('password')
    await core.create(frozen, 'synthetic-unlock-password')
    expect(port.create).toHaveBeenCalledWith(frozen, 'synthetic-unlock-password')
    await expect(core.create(intent(), 'unexpected')).rejects.toThrow('Unexpected')
  })
  it.each<OperationIntent['action']>([
    { kind: 'configure_filevault' },
    { kind: 'reconcile_filevault', material: { id, version: 2 }, recipient: null },
    { kind: 'collect_filevault', expectedRevision: 12, recipient: 'escrow-recipient' },
    { kind: 'rotate_filevault', expectedRevision: 12 },
    { kind: 'set_recovery_lock', expectedRevision: 0, current: null, clear: false },
    { kind: 'reconcile_recovery_lock', material: { id, version: 2 }, operation: registration },
    { kind: 'verify_recovery_lock', material: { id, version: 2 } },
  ])(
    'accepts the full formal native action $kind without inferring device effect',
    async (action) => {
      const { core, port } = fixture(),
        result = await core.create(
          { ...intent(), action },
          action.kind === 'rotate_filevault' ? 'synthetic-unlock' : undefined,
        )
      expect(result).toEqual({
        operationId,
        commandId: operationId,
        revision: 1,
        accepted: true as const,
      })
      expect(result).not.toHaveProperty('verified')
      expect(port.operation).not.toHaveBeenCalled()
    },
  )
  it('preserves original operation/deadline on unknown and performs no automatic read or retry', async () => {
    const unknown = new Error('operation_unknown'),
      { core, port } = fixture({
        create: vi.fn(async () => {
          throw unknown
        }),
      }),
      input = intent()
    await expect(core.create(input)).rejects.toBe(unknown)
    expect(port.create).toHaveBeenCalledTimes(1)
    expect(port.operation).not.toHaveBeenCalled()
    const found = await core.operation(device, operationId, input)
    expect(found.commandStatus).toBe('received')
    expect(found.observation.effect).toBe('unverified')
    expect(found).not.toHaveProperty('materialVerified')
  })
  it('rejects execution or software operations and mismatched original deadlines', async () => {
    for (const wrong of [
      { ...operation(), inputVersion: 'software-release/v1' },
      { ...operation(), deadline: 1800000001 },
      { ...operation(), operationId: id },
    ]) {
      const { core } = fixture({ operation: vi.fn(async () => wrong) })
      await expect(core.operation(device, operationId, intent())).rejects.toThrow('original')
    }
  })
  it('does not mistake a wrong operation or unconfirmed revocation for success', async () => {
    const { core } = fixture({
      create: vi.fn(async () => ({
        operationId: id,
        commandId: id,
        revision: 1,
        accepted: true as const,
      })),
      revoke: vi.fn(async () => material()),
    })
    await expect(core.create(intent())).rejects.toThrow('acceptance')
    await expect(core.revoke(target)).rejects.toThrow('revocation')
  })
})
