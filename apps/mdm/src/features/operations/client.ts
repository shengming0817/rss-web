import type { HttpTransport } from '@rss/api/mdm'
import { createAuditClient } from './clients/audit'
import { createAuthorizationClient } from './clients/authorization'
export function createOperationsClients(
  transport: HttpTransport,
  tenant: string,
  realm: 'tenant' | 'platform' = 'tenant',
) {
  return {
    authorization: createAuthorizationClient(transport, tenant, realm),
    audit: createAuditClient(transport),
  }
}
