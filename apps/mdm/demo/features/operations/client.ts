import type { HttpTransport } from '@rss/api/mdm'
import { createOperationsClients as createFormalClients } from '../../../src/features/operations/client'
import { createAdminClients } from './clients/admin'
import { createAuditClient } from './clients/audit'
import { createAlertsClient } from './clients/alerts'
export function createOperationsClients(
  transport: HttpTransport,
  tenant: string,
  demo: boolean,
  realm: 'tenant' | 'platform' = 'tenant',
) {
  return {
    ...createFormalClients(transport, tenant, realm),
    admin: createAdminClients(transport, tenant, demo),
    audit: createAuditClient(transport, tenant, demo),
    alerts: createAlertsClient(transport, tenant, demo),
  }
}
