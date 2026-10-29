import { expect, it } from 'vitest'
import { nativeCredentialAction, type NativeCredentialFields } from './native-credential-input'
const material = { id: '11111111-1111-4111-8111-111111111111', version: 3 },
  config = {
    enabled: true,
    revision: 5,
    materialRevision: 12,
    custodyId: '22222222-2222-4222-8222-222222222222',
    custodyEpoch: 8,
    recipientId: 'recipient',
    recipientCertificate: 'public certificate',
  }
const input = (kind: NativeCredentialFields['kind']): NativeCredentialFields => ({
  kind,
  deadline: '2027-01-01T12:00',
})
it('takes FileVault material CAS from its formal configuration rather than configuration revision or selected material version', () => {
  expect(
    nativeCredentialAction(
      { ...input('collect_filevault'), expectedRevision: 5, material },
      config,
      null,
    ),
  ).toEqual({ kind: 'collect_filevault', expectedRevision: 12, recipient: null })
  expect(nativeCredentialAction(input('rotate_filevault'), config, null)).toEqual({
    kind: 'rotate_filevault',
    expectedRevision: 12,
  })
  expect(() => nativeCredentialAction(input('rotate_filevault'), null, null)).toThrow('Read native')
})
it('requires an explicit recovery-lock CAS and an explicit absence choice for zero', () => {
  expect(() => nativeCredentialAction(input('set_recovery_lock'), config, null)).toThrow('CAS')
  expect(() =>
    nativeCredentialAction({ ...input('set_recovery_lock'), expectedRevision: 0 }, config, null),
  ).toThrow('CAS')
  expect(
    nativeCredentialAction({ ...input('set_recovery_lock'), noExisting: true }, config, null),
  ).toEqual({ kind: 'set_recovery_lock', expectedRevision: 0, current: null, clear: false })
  expect(
    nativeCredentialAction(
      {
        ...input('set_recovery_lock'),
        expectedRevision: 3,
        useCurrent: true,
        current: material,
        clear: true,
      },
      config,
      null,
    ),
  ).toEqual({ kind: 'set_recovery_lock', expectedRevision: 3, current: material, clear: true })
})
it('keeps all formal reconciliation identities and never adds the transient unlock password to an action', () => {
  expect(
    nativeCredentialAction(
      { ...input('configure_filevault'), unlockPassword: 'not-retained' },
      config,
      null,
    ),
  ).toEqual({ kind: 'configure_filevault' })
  expect(
    nativeCredentialAction(
      { ...input('reconcile_filevault'), material, recipient: 'recipient' },
      config,
      null,
    ),
  ).toEqual({ kind: 'reconcile_filevault', material, recipient: 'recipient' })
  expect(
    nativeCredentialAction(
      { ...input('reconcile_recovery_lock'), material, operation: config.custodyId },
      config,
      null,
    ),
  ).toEqual({ kind: 'reconcile_recovery_lock', material, operation: config.custodyId })
  expect(
    nativeCredentialAction({ ...input('verify_recovery_lock'), material }, config, null),
  ).toEqual({ kind: 'verify_recovery_lock', material })
  expect(() => nativeCredentialAction(input('verify_recovery_lock'), config, null)).toThrow(
    'Exact material',
  )
})
