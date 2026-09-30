import type { HttpTransport } from '@rss/api/mdm'
import { createAuditClient } from './clients/audit'
import { createAlertsClient } from './clients/alerts'
export function createOperationsClients(transport: HttpTransport, tenant: string, demo: boolean) {
  return {
    audit: createAuditClient(transport, tenant, demo),
    alerts: createAlertsClient(transport, tenant, demo),
  }
}
