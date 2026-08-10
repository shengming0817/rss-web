import { createAuthorizationPort, type AuthorizationPort } from './port'
import type { ServerAuthorizationHint } from './types'

const SERVER_HINT: ServerAuthorizationHint = Object.freeze({
  decision: 'unknown',
  source: Object.freeze({ kind: 'server', authority: 'deferred-to-request' }),
})

export function createServerAuthorizationPort(): AuthorizationPort {
  return createAuthorizationPort(() => SERVER_HINT)
}

export type { AuthorizationPort } from './port'
export type {
  AuthorizationDecision,
  AuthorizationHint,
  AuthorizationIntent,
  PreviewAuthorizationHint,
  ServerAuthorizationHint,
} from './types'
