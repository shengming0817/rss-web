import type {
  AccountStatusApi,
  IdentityApi,
  IdentitySession,
  LoginResponse,
  RefreshResponse,
  PasswordChangeRequest,
  VerifiedProfile,
} from './index'

declare const api: IdentityApi
declare const login: LoginResponse
declare const refresh: RefreshResponse

void login.data.sessionId
void login.data.expiresAt

// @ts-expect-error Refresh is token rotation, not a complete login session.
void refresh.data.sessionId
// @ts-expect-error Refresh does not extend the login session expiry field.
void refresh.data.expiresAt
// @ts-expect-error Identity adapters do not accept browser-authored authority headers.
void api.profile({ headers: { Authorization: 'fixture' } })

declare const session: IdentitySession
declare const passwordChange: PasswordChangeRequest
declare const verified: VerifiedProfile
void verified.subject
void session.transport
void session.changePassword(passwordChange)
declare const accountStatus: AccountStatusApi
void accountStatus.get('f47ac10b-58cc-4372-a567-0e02b2c3d479')
void session.invalidateForAccountStatusChange('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'locked')
// @ts-expect-error Account Status does not accept caller-authored headers.
void accountStatus.get('f47ac10b-58cc-4372-a567-0e02b2c3d479', { headers: { Authorization: 'x' } })
// @ts-expect-error Password change does not accept caller-authored headers.
void session.changePassword(passwordChange, { headers: { Authorization: 'fixture' } })
// @ts-expect-error Session state never exposes bearer credentials.
void session.getState().accessToken
// @ts-expect-error Refresh is internal to the protected transport single-flight.
void session.refresh()
// @ts-expect-error A decoded profile DTO cannot be promoted to verified authority.
const forged: VerifiedProfile = { subject: 'x', tenantId: 'x', kind: 'user' }
void forged
