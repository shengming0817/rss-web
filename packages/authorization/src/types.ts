export type AuthorizationDecision = 'allow' | 'deny' | 'unknown'

export interface AuthorizationIntent {
  readonly contractId: string
  readonly permission: string
  readonly resourceId?: string
}

export interface ServerAuthorizationHint {
  readonly decision: 'unknown'
  readonly source: {
    readonly kind: 'server'
    readonly authority: 'deferred-to-request'
  }
}

export interface PreviewAuthorizationHint {
  readonly decision: AuthorizationDecision
  readonly source: {
    readonly kind: 'preview'
    readonly authoritative: false
    readonly reason: 'scenario' | 'unmatched'
    readonly scenarioId?: string
  }
}

export type AuthorizationHint = ServerAuthorizationHint | PreviewAuthorizationHint
