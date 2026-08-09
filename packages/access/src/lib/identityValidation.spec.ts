import { describe, it, expect } from 'vitest'
import {
  validateCreateIdentity,
  isCreateIdentityValid,
  validateEditIdentity,
  isEditIdentityValid,
  validateChangePassword,
  isChangePasswordValid,
} from './identityValidation'

describe('validateCreateIdentity', () => {
  const ok = { username: 'alice', email: 'alice@corp.example', password: 'Secret!23' }

  it('passes a well-formed form', () => {
    expect(validateCreateIdentity(ok)).toEqual({ username: null, email: null, password: null })
    expect(isCreateIdentityValid(ok)).toBe(true)
  })

  it('flags a missing username then a malformed one', () => {
    expect(validateCreateIdentity({ ...ok, username: '' }).username).toBe(
      'access.identities.form.username.required',
    )
    expect(validateCreateIdentity({ ...ok, username: 'a' }).username).toBe(
      'access.identities.form.username.format',
    )
  })

  it('flags a missing email then a malformed one', () => {
    expect(validateCreateIdentity({ ...ok, email: '' }).email).toBe(
      'access.identities.form.email.required',
    )
    expect(validateCreateIdentity({ ...ok, email: 'nope' }).email).toBe(
      'access.identities.form.email.format',
    )
  })

  it('flags a missing, too-short, then control-char password', () => {
    expect(validateCreateIdentity({ ...ok, password: '' }).password).toBe(
      'access.identities.form.password.required',
    )
    expect(validateCreateIdentity({ ...ok, password: 'short' }).password).toBe(
      'access.identities.form.password.tooShort',
    )
    expect(validateCreateIdentity({ ...ok, password: 'abcdef\x07gh' }).password).toBe(
      'access.identities.form.password.controlChar',
    )
  })

  it('isCreateIdentityValid is false when any field is invalid', () => {
    expect(isCreateIdentityValid({ ...ok, email: 'bad' })).toBe(false)
  })
})

describe('validateEditIdentity', () => {
  it('requires a valid email', () => {
    expect(validateEditIdentity({ email: '' }).email).toBe('access.identities.form.email.required')
    expect(validateEditIdentity({ email: 'bad' }).email).toBe('access.identities.form.email.format')
    expect(validateEditIdentity({ email: 'ok@corp.example' }).email).toBeNull()
    expect(isEditIdentityValid({ email: 'ok@corp.example' })).toBe(true)
  })
})

describe('validateChangePassword', () => {
  const ok = { oldPassword: 'oldpass1', newPassword: 'New!2345', confirm: 'New!2345' }

  it('passes a well-formed form', () => {
    expect(validateChangePassword(ok)).toEqual({
      oldPassword: null,
      newPassword: null,
      confirm: null,
    })
    expect(isChangePasswordValid(ok)).toBe(true)
  })

  it('requires the old password', () => {
    expect(validateChangePassword({ ...ok, oldPassword: '' }).oldPassword).toBe(
      'access.identities.password.oldRequired',
    )
  })

  it('validates the new password length', () => {
    expect(validateChangePassword({ ...ok, newPassword: '', confirm: '' }).newPassword).toBe(
      'access.identities.password.newRequired',
    )
    expect(
      validateChangePassword({ ...ok, newPassword: 'short', confirm: 'short' }).newPassword,
    ).toBe('access.identities.password.newTooShort')
  })

  it('requires confirm to match the new password', () => {
    expect(validateChangePassword({ ...ok, confirm: '' }).confirm).toBe(
      'access.identities.password.confirmRequired',
    )
    expect(validateChangePassword({ ...ok, confirm: 'Different!9' }).confirm).toBe(
      'access.identities.password.confirmMismatch',
    )
  })
})
