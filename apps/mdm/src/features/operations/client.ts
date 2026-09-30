import type { HttpTransport } from '@rss/api/mdm'
import { createAuthorizationClient } from './clients/authorization'
import { createAdminClients } from './clients/admin'
import { createAuditClient } from './clients/audit'
import { createAlertsClient } from './clients/alerts'
export function createOperationsClients(transport: HttpTransport, tenant: string, demo: boolean) {
  return {
    authorization: createAuthorizationClient(transport, tenant),
    admin: createAdminClients(transport, tenant, demo),
    audit: createAuditClient(transport, tenant, demo),
    alerts: createAlertsClient(transport, tenant, demo),
  }
}
