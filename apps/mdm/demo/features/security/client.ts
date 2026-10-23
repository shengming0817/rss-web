import type { HttpTransport } from '@rss/api/mdm'
import { createSecurityClients as createFormalClients } from '../../../src/features/security/client'
import { createGovernanceClient } from './clients/governance'
import { createSecurityRequestsClient } from './clients/requests'
import { createRisksClient } from './clients/risks'
import { createSecurityActionsClient } from './clients/actions'
import { createMaterialsClient } from './clients/materials'
import { createSupportClient } from './clients/support'
export function createSecurityClients(transport: HttpTransport, tenant: string, demo: boolean) {
  return {
    ...createFormalClients(transport, tenant),
    governance: createGovernanceClient(transport, tenant, demo),
    requests: createSecurityRequestsClient(transport, tenant, demo),
    risks: createRisksClient(transport, tenant, demo),
    actions: createSecurityActionsClient(transport, tenant, demo),
    materials: createMaterialsClient(transport, tenant, demo),
    support: createSupportClient(transport, tenant, demo),
  }
}
