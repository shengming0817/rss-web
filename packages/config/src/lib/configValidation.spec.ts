import { describe, it, expect } from 'vitest'
import { validateConfigKey, validateConfigValue, isRedactedPlaceholder } from './configValidation'

describe('validateConfigKey', () => {
  it('returns null for a valid key', () => {
    expect(validateConfigKey('app.debug')).toBeNull()
    expect(validateConfigKey('feature.enable_new_ui')).toBeNull()
    expect(validateConfigKey('x')).toBeNull()
    expect(validateConfigKey('a/b')).toBeNull()
  })

  it('returns i18n key for empty string', () => {
    expect(validateConfigKey('')).toBe('config.entries.validation.key.required')
  })

  it('returns i18n key for whitespace-only string', () => {
    expect(validateConfigKey('   ')).toBe('config.entries.validation.key.required')
  })

  it('returns i18n key for key that exceeds 255 characters', () => {
    expect(validateConfigKey('a'.repeat(256))).toBe('config.entries.validation.key.tooLong')
  })

  it('returns null for a 255-character key (boundary)', () => {
    expect(validateConfigKey('a'.repeat(255))).toBeNull()
  })

  it('returns i18n key when key contains control characters', () => {
    expect(validateConfigKey('app\x00debug')).toBe('config.entries.validation.key.invalidChars')
    expect(validateConfigKey('app\x1fdebug')).toBe('config.entries.validation.key.invalidChars')
  })
})

describe('validateConfigValue', () => {
  it('returns null for any non-empty non-redacted value', () => {
    expect(validateConfigValue('true')).toBeNull()
    expect(validateConfigValue('0')).toBeNull()
    expect(validateConfigValue(' space ')).toBeNull()
  })

  it('returns i18n key for empty string', () => {
    expect(validateConfigValue('')).toBe('config.entries.validation.value.required')
  })

  it('returns i18n key when value is the redacted placeholder', () => {
    expect(validateConfigValue('******')).toBe('config.entries.validation.value.sensitiveRedacted')
  })

  it('returns null for a value that is similar but not the exact placeholder', () => {
    expect(validateConfigValue('*****')).toBeNull() // 5 stars — not the exact 6-star placeholder
    expect(validateConfigValue('*******')).toBeNull() // 7 stars
  })
})

describe('isRedactedPlaceholder', () => {
  it('returns true for the exact 6-star placeholder', () => {
    expect(isRedactedPlaceholder('******')).toBe(true)
  })

  it('returns false for any other value', () => {
    expect(isRedactedPlaceholder('')).toBe(false)
    expect(isRedactedPlaceholder('*****')).toBe(false)
    expect(isRedactedPlaceholder('*******')).toBe(false)
    expect(isRedactedPlaceholder('actual-secret')).toBe(false)
  })
})
