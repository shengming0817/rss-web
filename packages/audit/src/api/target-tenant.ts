export const AUDIT_TARGET_TENANT_PATTERN =
  '(?!00000000-0000-0000-0000-000000000000$)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

const targetTenant = new RegExp(`^${AUDIT_TARGET_TENANT_PATTERN}$`)

export function isAuditTargetTenantId(value: string): boolean {
  return targetTenant.test(value)
}
