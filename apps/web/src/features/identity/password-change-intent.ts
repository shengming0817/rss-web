import type { AuthorizationIntent } from '@rss/authorization'

export const PASSWORD_CHANGE_INTENT = Object.freeze({
  contractId: 'identity.password-change',
  permission: 'identity:profile:write',
}) satisfies AuthorizationIntent
