import type { AuthorizationIntent } from '@rss/authorization'

export const POLICIES_LIST_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'identity.policies-list',
  permission: 'identity:policy:read',
})

export const POLICIES_GET_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'identity.policies-get',
  permission: 'identity:policy:read',
})

export const POLICIES_CREATE_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'identity.policies-create',
  permission: 'identity:policy:create',
})

export const POLICIES_UPDATE_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'identity.policies-update',
  permission: 'identity:policy:update',
})

export const POLICIES_DEACTIVATE_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'identity.policies-deactivate',
  permission: 'identity:policy:deactivate',
})
