export type SafeErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'rateLimited'
  | 'serviceUnavailable'
  | 'invalidResponse'
  | 'unknown'

export interface SafeErrorPresentation {
  readonly kind: SafeErrorKind
  readonly code: string
  readonly retryable: boolean
  readonly recovery: 'signIn' | 'retry' | 'home'
  readonly requestId?: string
}
