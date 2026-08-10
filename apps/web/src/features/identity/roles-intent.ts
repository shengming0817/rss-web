import type { AuthorizationIntent } from '@rss/authorization'

export const ROLES_LIST_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'identity.roles-list',
  permission: 'identity:role:read',
})

export const ROLE_ASSIGN_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'identity.roles-assign',
  permission: 'identity:role:assign',
})

export const ROLE_REVOKE_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'identity.roles-revoke',
  permission: 'identity:role:revoke',
})
