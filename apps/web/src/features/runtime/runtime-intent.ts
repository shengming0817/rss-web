import type { AuthorizationIntent } from '@rss/authorization'

export const RUNTIME_INVENTORY_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'runtime.inventory',
  permission: 'runtime:inventory:read',
})
