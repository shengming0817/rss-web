import type { AuthorizationIntent } from '@rss/authorization'

export const SECRET_RESOLVE_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'settings.secret-resolve',
  permission: 'settings.secret-resolve',
})
