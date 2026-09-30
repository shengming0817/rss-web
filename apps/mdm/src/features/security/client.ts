import type { HttpTransport } from '@rss/api/mdm'
import { createComplianceClient } from './clients/compliance'
import { createGovernanceClient } from './clients/governance'
import { createSecurityRequestsClient } from './clients/requests'
export function createSecurityClients(transport: HttpTransport, tenant: string, demo: boolean) {
  return {
    compliance: createComplianceClient(transport),
    governance: createGovernanceClient(transport, tenant, demo),
    requests: createSecurityRequestsClient(transport, tenant, demo),
  }
}
