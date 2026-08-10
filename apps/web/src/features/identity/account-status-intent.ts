import type { AuthorizationIntent } from '@rss/authorization'

export const ACCOUNT_STATUS_READ_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'identity.account-status-get',
  permission: 'identity:account-security:read',
})

export const ACCOUNT_STATUS_WRITE_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'identity.account-status-set',
  permission: 'identity:account-security:write',
})
