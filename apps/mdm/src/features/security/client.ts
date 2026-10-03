import { createCertificateArchiveClient } from './certificate-archive/client'
import type { HttpTransport } from '@rss/api/mdm'
import { createComplianceClient } from './clients/compliance'
import { createGovernanceClient } from './clients/governance'
import { createSecurityRequestsClient } from './clients/requests'
import { createRisksClient } from './clients/risks'
import { createSecurityActionsClient } from './clients/actions'
import { createMaterialsClient } from './clients/materials'
import { createCertificatesClient } from './clients/certificates'
import { createSupportClient } from './clients/support'
export function createSecurityClients(transport: HttpTransport, tenant: string, demo: boolean) {
  return {
    certificateArchive: createCertificateArchiveClient(transport, tenant),
    compliance: createComplianceClient(transport),
    governance: createGovernanceClient(transport, tenant, demo),
    requests: createSecurityRequestsClient(transport, tenant, demo),
    risks: createRisksClient(transport, tenant, demo),
    actions: createSecurityActionsClient(transport, tenant, demo),
    support: createSupportClient(transport, tenant, demo),
    certificates: createCertificatesClient(transport, tenant, demo),
    materials: createMaterialsClient(transport, tenant, demo),
  }
}
