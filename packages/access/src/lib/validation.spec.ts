import { describe, it, expect } from 'vitest'
import {
  hasControlChar,
  pwChecks,
  pwScore,
  passwordStrength,
  validateOperator,
  validateAdmin,
} from './validation'

describe('hasControlChar', () => {
  it('detects control characters', () => {
    expect(hasControlChar('ab\x00cd')).toBe(true)
    expect(hasControlChar('clean-pass')).toBe(false)
  })
})

describe('pwChecks / pwScore / passwordStrength', () => {
  it('flags each rule independently', () => {
    expect(pwChecks('short')).toMatchObject({ len: false })
    const strong = pwChecks('Abcdef1!')
    expect(strong).toEqual({ len: true, ctrl: true, case: true, num: true, sym: true })
  })

  it('rejects > 72 bytes for the length rule', () => {
    expect(pwChecks('a'.repeat(73)).len).toBe(false)
  })

  it('scores the number of satisfied rules', () => {
    expect(pwScore(pwChecks('Abcdef1!'))).toBe(5)
    expect(pwScore(pwChecks('abc'))).toBeLessThan(3)
  })

  it('maps score to strength bands', () => {
    expect(passwordStrength(pwScore(pwChecks('abc')))).toBe('weak')
    expect(passwordStrength(pwScore(pwChecks('Abcdefgh')))).toBe('mid')
    expect(passwordStrength(pwScore(pwChecks('Abcdef1!')))).toBe('strong')
  })
})

describe('validateOperator', () => {
  it('passes for valid credentials (all null)', () => {
    expect(validateOperator({ username: 'ops', password: 'rootpass1' })).toEqual({
      username: null,
      password: null,
    })
  })

  it('requires username and password (returns i18n keys)', () => {
    const errs = validateOperator({ username: '', password: '' })
    expect(errs.username).toBe('access.firstRun.operator.usernameRequired')
    expect(errs.password).toBe('access.firstRun.operator.passwordRequired')
  })

  it('rejects a too-short password after trim', () => {
    expect(validateOperator({ username: 'ops', password: '  abc  ' }).password).toBe(
      'access.firstRun.operator.passwordTooShort',
    )
  })

  it('rejects control characters', () => {
    expect(validateOperator({ username: 'o\x01ps', password: 'rootpass1' }).username).toBe(
      'access.firstRun.operator.controlChar',
    )
  })
})

describe('validateAdmin', () => {
  const valid = {
    username: 'admin',
    email: 'admin@corp.example',
    password: 'SecretPass!23',
    confirm: 'SecretPass!23',
  }

  it('passes for a fully valid form', () => {
    expect(validateAdmin(valid)).toEqual({
      username: null,
      email: null,
      password: null,
      confirm: null,
    })
  })

  it('rejects a malformed username', () => {
    expect(validateAdmin({ ...valid, username: 'ab' }).username).toBe(
      'access.firstRun.admin.username.format',
    )
  })

  it('rejects a malformed email', () => {
    expect(validateAdmin({ ...valid, email: 'not-an-email' }).email).toBe(
      'access.firstRun.admin.email.format',
    )
  })

  it('rejects a too-short password', () => {
    expect(validateAdmin({ ...valid, password: 'short', confirm: 'short' }).password).toBe(
      'access.firstRun.admin.password.tooShort',
    )
  })

  it('rejects a mismatched confirmation', () => {
    expect(validateAdmin({ ...valid, confirm: 'different' }).confirm).toBe(
      'access.firstRun.admin.confirm.mismatch',
    )
  })

  it('flags empty required fields', () => {
    const errs = validateAdmin({ username: '', email: '', password: '', confirm: '' })
    expect(errs.username).toBe('access.firstRun.admin.username.required')
    expect(errs.email).toBe('access.firstRun.admin.email.required')
    expect(errs.password).toBe('access.firstRun.admin.password.required')
    expect(errs.confirm).toBe('access.firstRun.admin.confirm.required')
  })
})
