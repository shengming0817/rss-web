import { createCredentialsClient } from './clients/credentials'
import type { HttpTransport } from '@rss/api/mdm'
import { createCertificateArchiveClient } from './certificate-archive/client'
import { createComplianceClient } from './clients/compliance'
export function createSecurityClients(transport: HttpTransport, tenant: string) {
  return {
    credentials: createCredentialsClient(transport),
    certificateArchive: createCertificateArchiveClient(transport, tenant),
    compliance: createComplianceClient(transport),
  }
}
