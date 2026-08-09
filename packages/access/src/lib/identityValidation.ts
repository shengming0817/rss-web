/**
 * identityValidation.ts — pure validators for the identity operation modals.
 *
 * Same contract as lib/validation.ts: validators return i18n KEY strings (never
 * display text) or `null` when valid, so views map them through `t()` and the
 * functions stay trivially unit-testable. Username/email rules + password checks
 * are reused from lib/validation.ts (single source for those regexes).
 */
import { pwChecks, EMAIL_RE, USERNAME_RE } from './validation'

export interface CreateIdentityForm {
  username: string
  email: string
  password: string
}
export interface CreateIdentityErrors {
  username: string | null
  email: string | null
  password: string | null
}

export function validateCreateIdentity({
  username,
  email,
  password,
}: CreateIdentityForm): CreateIdentityErrors {
  const out: CreateIdentityErrors = { username: null, email: null, password: null }

  if (!username) out.username = 'access.identities.form.username.required'
  else if (!USERNAME_RE.test(username)) out.username = 'access.identities.form.username.format'

  if (!email) out.email = 'access.identities.form.email.required'
  else if (!EMAIL_RE.test(email)) out.email = 'access.identities.form.email.format'

  const checks = pwChecks(password)
  if (!password) out.password = 'access.identities.form.password.required'
  else if (!checks.len) out.password = 'access.identities.form.password.tooShort'
  else if (!checks.ctrl) out.password = 'access.identities.form.password.controlChar'

  return out
}

export function isCreateIdentityValid(form: CreateIdentityForm): boolean {
  const e = validateCreateIdentity(form)
  return e.username === null && e.email === null && e.password === null
}

export interface EditIdentityForm {
  email: string
}
export interface EditIdentityErrors {
  email: string | null
}

export function validateEditIdentity({ email }: EditIdentityForm): EditIdentityErrors {
  const out: EditIdentityErrors = { email: null }
  if (!email) out.email = 'access.identities.form.email.required'
  else if (!EMAIL_RE.test(email)) out.email = 'access.identities.form.email.format'
  return out
}

export function isEditIdentityValid(form: EditIdentityForm): boolean {
  return validateEditIdentity(form).email === null
}

export interface ChangePasswordForm {
  oldPassword: string
  newPassword: string
  confirm: string
}
export interface ChangePasswordErrors {
  oldPassword: string | null
  newPassword: string | null
  confirm: string | null
}

export function validateChangePassword({
  oldPassword,
  newPassword,
  confirm,
}: ChangePasswordForm): ChangePasswordErrors {
  const out: ChangePasswordErrors = { oldPassword: null, newPassword: null, confirm: null }

  if (!oldPassword) out.oldPassword = 'access.identities.password.oldRequired'

  const checks = pwChecks(newPassword)
  if (!newPassword) out.newPassword = 'access.identities.password.newRequired'
  else if (!checks.len) out.newPassword = 'access.identities.password.newTooShort'
  else if (!checks.ctrl) out.newPassword = 'access.identities.password.newControlChar'

  if (!confirm) out.confirm = 'access.identities.password.confirmRequired'
  else if (confirm !== newPassword) out.confirm = 'access.identities.password.confirmMismatch'

  return out
}

export function isChangePasswordValid(form: ChangePasswordForm): boolean {
  const e = validateChangePassword(form)
  return e.oldPassword === null && e.newPassword === null && e.confirm === null
}
