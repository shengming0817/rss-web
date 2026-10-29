/** Authentication facts are presentation, never resource authorization. */
export interface Session {
  readonly id: string
  readonly issuedAt: number
  readonly idleExpiresAt: number
  readonly absoluteExpiresAt: number
}
export interface Identity {
  readonly principalId: string
  readonly hasLocalPassword: boolean
}
export interface SessionEnvelope {
  session: Session
  identity: Identity
  csrfToken: string
}
export interface HostContext {
  readonly tenantId: string
  readonly principalId: string
  readonly sessionId: string
  readonly navigation: { readonly manageAccounts: boolean; readonly manageProviders: boolean }
}
export interface Provider {
  readonly id: string
  readonly label: string
}
export interface Security {
  readonly sessionId: string
  readonly authentication: {
    readonly source: 'local_password' | 'oidc' | 'platform'
    readonly authTime: number | null
    readonly acr: 'unspecified' | 'mfa'
    readonly amr: readonly ('mfa' | 'otp' | 'pwd')[]
  }
  readonly eligibleStepUpProviders: readonly Provider[]
}
/** Only actual host operations may request a purpose-bound step-up. */
export type StepUpOperation =
  | { kind: 'register' }
  | { kind: 'remove'; credential: string }
  | { kind: 'recover' }
export type FailureKind = 'unauthenticated' | 'unavailable' | 'rejected'
export interface AuthPort {
  check(tenant: string): Promise<SessionEnvelope>
  login(tenant: string, login: string, password: string, csrf?: string): Promise<SessionEnvelope>
  refresh(tenant: string, csrf: string): Promise<SessionEnvelope>
  reauthenticate(tenant: string, csrf: string, password: string): Promise<SessionEnvelope>
  logout(tenant: string, csrf: string, all: boolean): Promise<void>
  context(tenant: string): Promise<HostContext>
  security(tenant: string): Promise<Security>
  providers(tenant: string): Promise<readonly Provider[]>
  beginSso(tenant: string, provider: string, csrf?: string): Promise<string>
  stepUp(
    tenant: string,
    csrf: string,
    provider: string,
    operation: StepUpOperation,
  ): Promise<string>
  classify(error: unknown): FailureKind
}
export interface SessionState {
  readonly status: 'anonymous' | 'checking' | 'authenticated' | 'unavailable'
  readonly tenant: string | null
  readonly session: Session | null
  readonly identity: Identity | null
  readonly host: HostContext | null
  readonly security: Security | null
  readonly navigation: 'idle' | 'loading' | 'ready' | 'unavailable'
  readonly invalidated: boolean
  readonly logoutOutcome: 'idle' | 'pending' | 'unconfirmed'
}
