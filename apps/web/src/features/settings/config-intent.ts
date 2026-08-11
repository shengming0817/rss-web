import type { AuthorizationIntent } from '@rss/authorization'

export const CONFIG_GET_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'settings.config-get',
  permission: 'settings.config-get',
})
export const CONFIG_PUBLISH_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'settings.config-publish',
  permission: 'settings.config-publish',
})
export const CONFIG_DELETE_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'settings.config-delete',
  permission: 'settings.config-delete',
})
export const CONFIG_ROLLBACK_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'settings.config-rollback',
  permission: 'settings.config-rollback',
})
