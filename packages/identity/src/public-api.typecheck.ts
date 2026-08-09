import type { IdentityApi, LoginResponse, RefreshResponse } from './index'

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
