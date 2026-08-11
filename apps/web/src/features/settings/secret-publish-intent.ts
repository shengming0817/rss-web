import type { AuthorizationIntent } from '@rss/authorization'

export const SECRET_PUBLISH_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'settings.secret-publish',
  permission: 'settings.secret-publish',
})
