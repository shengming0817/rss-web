import type { HttpTransport } from '@rss/api'
import { identityEndpoints } from '@rss/api/endpoints/identity'
import {
  decodeLoginResponse,
  decodeLogoutAllResponse,
  decodeLogoutResponse,
  decodeProfileResponse,
  decodeRefreshResponse,
} from './decoders'
import type {
  IdentityCallOptions,
  LoginRequest,
  LoginResponse,
  LogoutAllResponse,
  LogoutResponse,
  ProfileResponse,
  RefreshRequest,
  RefreshResponse,
} from './types'

export interface IdentityApi {
  login(request: LoginRequest, options?: IdentityCallOptions): Promise<LoginResponse>
  refresh(request: RefreshRequest, options?: IdentityCallOptions): Promise<RefreshResponse>
  profile(options?: IdentityCallOptions): Promise<ProfileResponse>
  logout(options?: IdentityCallOptions): Promise<LogoutResponse>
  logoutAll(options?: IdentityCallOptions): Promise<LogoutAllResponse>
}

function signalOption(options?: IdentityCallOptions): { signal?: AbortSignal } {
  return options?.signal === undefined ? {} : { signal: options.signal }
}

export function createIdentityApi(transport: HttpTransport): IdentityApi {
  return Object.freeze({
    login(request: LoginRequest, options?: IdentityCallOptions) {
      return transport.request({
        ...identityEndpoints.login,
        body: { username: request.username, password: request.password },
        decode: decodeLoginResponse,
        ...signalOption(options),
      })
    },
    refresh(request: RefreshRequest, options?: IdentityCallOptions) {
      return transport.request({
        ...identityEndpoints.refresh,
        body: { refreshToken: request.refreshToken },
        decode: decodeRefreshResponse,
        ...signalOption(options),
      })
    },
    profile(options?: IdentityCallOptions) {
      return transport.request({
        ...identityEndpoints.profile,
        decode: decodeProfileResponse,
        session: 'required',
        ...signalOption(options),
      })
    },
    logout(options?: IdentityCallOptions) {
      return transport.request({
        ...identityEndpoints.logout,
        body: {},
        decode: decodeLogoutResponse,
        session: 'required',
        ...signalOption(options),
      })
    },
    logoutAll(options?: IdentityCallOptions) {
      return transport.request({
        ...identityEndpoints.logoutAll,
        body: {},
        decode: decodeLogoutAllResponse,
        session: 'required',
        ...signalOption(options),
      })
    },
  })
}
