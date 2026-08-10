import type { HttpTransport } from '@rss/api'
import type { LoginRequest, PasswordChangeRequest, ProfileKind } from '../api/types'

declare const VERIFIED_PROFILE: unique symbol

export type VerifiedProfileKind = Exclude<ProfileKind, 'anonymous'>

export interface VerifiedProfile {
  readonly subject: string
  readonly tenantId: string
  readonly kind: VerifiedProfileKind
  readonly [VERIFIED_PROFILE]: true
}

export type IdentitySessionState =
  | Readonly<{ status: 'anonymous' }>
  | Readonly<{ status: 'authenticating' }>
  | Readonly<{ status: 'verifying' }>
  | Readonly<{
      status: 'authenticated'
      profile: VerifiedProfile
      sessionExpiresAt: number
      accessExpiresAt: number
    }>
  | Readonly<{
      status: 'refreshing'
      profile: VerifiedProfile
      sessionExpiresAt: number
      accessExpiresAt: number
    }>
  | Readonly<{ status: 'expired' }>

export interface SessionOperationOptions {
  readonly signal?: AbortSignal
}

export type IdentitySessionListener = (state: IdentitySessionState) => void

export interface IdentitySession {
  readonly transport: HttpTransport
  getState(): IdentitySessionState
  subscribe(listener: IdentitySessionListener): () => void
  login(request: LoginRequest, options?: SessionOperationOptions): Promise<VerifiedProfile>
  logout(options?: SessionOperationOptions): Promise<void>
  logoutAll(options?: SessionOperationOptions): Promise<void>
  changePassword(request: PasswordChangeRequest, options?: SessionOperationOptions): Promise<void>
}

export interface IdentitySessionConfig {
  readonly transport: HttpTransport
  readonly nowEpochSeconds?: () => number
}

export type IdentitySessionErrorCode =
  | 'SESSION_BUSY'
  | 'SESSION_UNAVAILABLE'
  | 'PROFILE_NOT_AUTHORITATIVE'
  | 'SESSION_INVALIDATED'
  | 'SESSION_OPERATION_ABORTED'

export interface IdentitySessionError extends Error {
  readonly name: 'IdentitySessionError'
  readonly code: IdentitySessionErrorCode
}
