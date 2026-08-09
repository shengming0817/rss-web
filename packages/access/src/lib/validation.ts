/**
 * validation.ts — pure first-run credential validators.
 *
 * Mirror the kernel-side checks (bcrypt 72-byte cap, control-char rejection,
 * TrimSpace semantics). Validators return i18n KEY strings (never display text)
 * so the view maps them through `t()` — keeps the rule zero-hardcoded-string and
 * the functions trivially unit-testable.
 */

// Matching control characters is the explicit intent here (mirrors the backend
// rejection of control chars in bootstrap creds), so no-control-regex is moot.
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x08\x0E-\x1F\x7F]/
// Exported for reuse by identity-management validators (same username/email rules).
export const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/i
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Trim leading/trailing whitespace (mirrors backend TrimSpace on bootstrap creds). */
function trim(s: string): string {
  return s.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '')
}

export function hasControlChar(s: string): boolean {
  return CONTROL_CHAR_RE.test(s)
}

export interface PwChecks {
  len: boolean
  ctrl: boolean
  case: boolean
  num: boolean
  sym: boolean
}

export type PwStrength = 'weak' | 'mid' | 'strong'

export function pwChecks(p: string): PwChecks {
  return {
    len: p.length >= 8 && p.length <= 72,
    ctrl: !!p && !hasControlChar(p),
    case: /[a-z]/.test(p) && /[A-Z]/.test(p),
    num: /\d/.test(p),
    sym: /[^A-Za-z0-9]/.test(p),
  }
}

export function pwScore(checks: PwChecks): number {
  return Object.values(checks).filter(Boolean).length
}

export function passwordStrength(score: number): PwStrength {
  if (score < 3) return 'weak'
  if (score < 5) return 'mid'
  return 'strong'
}

export interface OperatorForm {
  username: string
  password: string
}

export interface OperatorErrors {
  username: string | null
  password: string | null
}

export function validateOperator({ username, password }: OperatorForm): OperatorErrors {
  const u = trim(username)
  const p = trim(password)
  const out: OperatorErrors = { username: null, password: null }

  if (!u) out.username = 'access.firstRun.operator.usernameRequired'
  else if (hasControlChar(u)) out.username = 'access.firstRun.operator.controlChar'

  if (!p) out.password = 'access.firstRun.operator.passwordRequired'
  else if (hasControlChar(p)) out.password = 'access.firstRun.operator.controlChar'
  else if (p.length < 8) out.password = 'access.firstRun.operator.passwordTooShort'

  return out
}

export interface AdminForm {
  username: string
  email: string
  password: string
  confirm: string
}

export interface AdminErrors {
  username: string | null
  email: string | null
  password: string | null
  confirm: string | null
}

export function validateAdmin({ username, email, password, confirm }: AdminForm): AdminErrors {
  const out: AdminErrors = { username: null, email: null, password: null, confirm: null }

  if (!username) out.username = 'access.firstRun.admin.username.required'
  else if (!USERNAME_RE.test(username)) out.username = 'access.firstRun.admin.username.format'

  if (!email) out.email = 'access.firstRun.admin.email.required'
  else if (!EMAIL_RE.test(email)) out.email = 'access.firstRun.admin.email.format'

  const checks = pwChecks(password)
  if (!password) out.password = 'access.firstRun.admin.password.required'
  else if (!checks.len) out.password = 'access.firstRun.admin.password.tooShort'
  else if (!checks.ctrl) out.password = 'access.firstRun.admin.password.controlChar'

  if (!confirm) out.confirm = 'access.firstRun.admin.confirm.required'
  else if (confirm !== password) out.confirm = 'access.firstRun.admin.confirm.mismatch'

  return out
}

/** True when every field error is null. */
export function isOperatorValid(form: OperatorForm): boolean {
  const e = validateOperator(form)
  return e.username === null && e.password === null
}

export function isAdminValid(form: AdminForm): boolean {
  const e = validateAdmin(form)
  return e.username === null && e.email === null && e.password === null && e.confirm === null
}
