import type { AuthorizationIntent } from '@rss/authorization'

export const POLICIES_LIST_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'identity.policies-list',
  permission: 'identity:policy:read',
})

export const POLICIES_GET_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'identity.policies-get',
  permission: 'identity:policy:read',
})
