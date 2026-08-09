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
  LoginRequest,
  LoginResponse,
  LogoutAllResponse,
  LogoutResponse,
  ProfileResponse,
  RefreshRequest,
  RefreshResponse,
} from './types'

export interface IdentityApi {
  login(request: LoginRequest): Promise<LoginResponse>
  refresh(request: RefreshRequest): Promise<RefreshResponse>
  profile(): Promise<ProfileResponse>
  logout(): Promise<LogoutResponse>
  logoutAll(): Promise<LogoutAllResponse>
}

export function createIdentityApi(transport: HttpTransport): IdentityApi {
  return Object.freeze({
    login(request: LoginRequest) {
      return transport.request({
        ...identityEndpoints.login,
        body: { username: request.username, password: request.password },
        decode: decodeLoginResponse,
      })
    },
    refresh(request: RefreshRequest) {
      return transport.request({
        ...identityEndpoints.refresh,
        body: { refreshToken: request.refreshToken },
        decode: decodeRefreshResponse,
      })
    },
    profile() {
      return transport.request({
        ...identityEndpoints.profile,
        decode: decodeProfileResponse,
      })
    },
    logout() {
      return transport.request({
        ...identityEndpoints.logout,
        body: {},
        decode: decodeLogoutResponse,
      })
    },
    logoutAll() {
      return transport.request({
        ...identityEndpoints.logoutAll,
        body: {},
        decode: decodeLogoutAllResponse,
      })
    },
  })
}
