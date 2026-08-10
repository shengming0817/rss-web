import type {
  IdentityApi,
  IdentitySession,
  LoginResponse,
  RefreshResponse,
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
declare const verified: VerifiedProfile
void verified.subject
void session.transport
// @ts-expect-error Session state never exposes bearer credentials.
void session.getState().accessToken
// @ts-expect-error Refresh is internal to the protected transport single-flight.
void session.refresh()
// @ts-expect-error A decoded profile DTO cannot be promoted to verified authority.
const forged: VerifiedProfile = { subject: 'x', tenantId: 'x', kind: 'user' }
void forged
