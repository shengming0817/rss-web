/**
 * identityValidation.ts — pure validators for the identity operation modals.
 *
 * Validators return i18n key strings or `null`, keeping display text in the
 * locale catalogs and the rules independently testable.
 */
const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x08\x0e-\x1f\x7f]/

function passwordChecks(password: string): { len: boolean; ctrl: boolean } {
  return {
    len: password.length >= 8 && password.length <= 72,
    ctrl: password.length > 0 && !CONTROL_CHAR_RE.test(password),
  }
}

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

  const checks = passwordChecks(password)
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

  const checks = passwordChecks(newPassword)
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
