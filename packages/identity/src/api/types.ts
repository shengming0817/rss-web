export interface LoginRequest {
  readonly username: string
  readonly password: string
}

export interface LoginData {
  readonly sessionId: string
  readonly expiresAt: number
  readonly accessToken: string
  readonly refreshToken: string
  readonly accessExpiresAt: number
}

export interface LoginResponse {
  readonly data: LoginData
}

export interface RefreshRequest {
  readonly refreshToken: string
}

export interface RefreshData {
  readonly accessToken: string
  readonly refreshToken: string
  readonly accessExpiresAt: number
}

export interface RefreshResponse {
  readonly data: RefreshData
}

export type ProfileKind = 'user' | 'device' | 'admin' | 'superAdmin' | 'service' | 'anonymous'

export interface ProfileData {
  readonly subject: string
  readonly tenantId: string
  readonly kind: ProfileKind
}

export interface ProfileResponse {
  readonly data: ProfileData
}

export interface LogoutData {
  readonly loggedOut: boolean
}

export interface LogoutResponse {
  readonly data: LogoutData
}

export interface LogoutAllData {
  readonly loggedOut: boolean
}

export interface LogoutAllResponse {
  readonly data: LogoutAllData
}
