import type { AuthorizationHint, AuthorizationIntent } from './types'

const AUTHORIZATION_PORT = Symbol('rss.authorization.port')

export interface AuthorizationPort {
  readonly [AUTHORIZATION_PORT]: true
  preview(intent: AuthorizationIntent): AuthorizationHint
  execute<T>(intent: AuthorizationIntent, operation: () => Promise<T>): Promise<T>
}

type Preview = (intent: AuthorizationIntent) => AuthorizationHint

export function createAuthorizationPort(preview: Preview): AuthorizationPort {
  return Object.freeze({
    [AUTHORIZATION_PORT]: true as const,
    preview,
    execute<T>(_intent: AuthorizationIntent, operation: () => Promise<T>): Promise<T> {
      return operation()
    },
  })
}
