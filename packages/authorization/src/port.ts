import type { AuthorizationHint, AuthorizationIntent } from './types'
import { authorizationIntentKey } from './intent'

const AUTHORIZATION_PORT = Symbol('rss.authorization.port')

export interface AuthorizationPort {
  readonly [AUTHORIZATION_PORT]: true
  preview(intent: AuthorizationIntent): AuthorizationHint
  matches(left: AuthorizationIntent, right: AuthorizationIntent): boolean
  invalidate(intent: AuthorizationIntent): void
  reset(): void
  execute<T>(intent: AuthorizationIntent, operation: () => Promise<T>): Promise<T>
}

type Preview = (intent: AuthorizationIntent) => AuthorizationHint
interface AuthorizationPortControls {
  invalidate?(intent: AuthorizationIntent): void
  reset?(): void
}

export function createAuthorizationPort(
  preview: Preview,
  controls: AuthorizationPortControls = {},
): AuthorizationPort {
  return Object.freeze({
    [AUTHORIZATION_PORT]: true as const,
    preview,
    matches(left: AuthorizationIntent, right: AuthorizationIntent): boolean {
      const leftKey = authorizationIntentKey(left)
      return leftKey !== undefined && leftKey === authorizationIntentKey(right)
    },
    invalidate(intent: AuthorizationIntent): void {
      if (authorizationIntentKey(intent) !== undefined) controls.invalidate?.(intent)
    },
    reset(): void {
      controls.reset?.()
    },
    execute<T>(_intent: AuthorizationIntent, operation: () => Promise<T>): Promise<T> {
      return operation()
    },
  })
}
