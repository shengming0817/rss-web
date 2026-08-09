/**
 * configValidation.ts — pure config-entry field validators.
 *
 * Validators return i18n KEY strings (never display text) so the view maps
 * them through t() — keeps rules zero-hardcoded-string and trivially unit-testable.
 *
 * Sensitive write guard: isRedactedPlaceholder() detects the backend's
 * dto.RedactedValue literal ("******") so store/api can refuse to echo it
 * back as a write-path value.
 */

/** The backend's redaction placeholder for sensitive entry values. */
const REDACTED_PLACEHOLDER = '******'

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x08\x0E-\x1F\x7F]/

/** Maximum key length accepted by the backend. */
const KEY_MAX_LEN = 255

/**
 * Validate a config entry key.
 * Returns an i18n key string on error, or null when valid.
 */
export function validateConfigKey(key: string): string | null {
  if (!key || !key.trim()) return 'config.entries.validation.key.required'
  if (key.length > KEY_MAX_LEN) return 'config.entries.validation.key.tooLong'
  if (CONTROL_CHAR_RE.test(key)) return 'config.entries.validation.key.invalidChars'
  return null
}

/**
 * Validate a config entry value.
 * Returns an i18n key string on error, or null when valid.
 *
 * NOTE: the redacted-placeholder check here is a UX guard that surfaces a
 * clear message when the user hasn't entered a new value for a sensitive entry.
 * The store mutation also guards on isRedactedPlaceholder() before submitting.
 */
export function validateConfigValue(value: string): string | null {
  if (value === '') return 'config.entries.validation.value.required'
  if (isRedactedPlaceholder(value)) return 'config.entries.validation.value.sensitiveRedacted'
  return null
}

/**
 * True when value is the backend's redaction placeholder.
 * Sensitive-entry write guard: store mutations must NOT echo this string back
 * as input — the user must supply an actual new value.
 */
export function isRedactedPlaceholder(value: string): boolean {
  return value === REDACTED_PLACEHOLDER
}
