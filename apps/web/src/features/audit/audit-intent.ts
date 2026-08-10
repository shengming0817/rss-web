import type { AuthorizationIntent } from '@rss/authorization'

export const AUDIT_AMBIENT_INTENT: AuthorizationIntent = Object.freeze({
  contractId: 'audit.list-entries',
  permission: 'audit:read',
})

export const auditTenantIntent = (tenantId: string): AuthorizationIntent =>
  Object.freeze({
    contractId: 'audit.list-tenant-entries',
    permission: 'audit:read',
    resourceId: tenantId,
  })
