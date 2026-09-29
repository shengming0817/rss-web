import type { HttpTransport } from '@rss/api/mdm'
import { createAdmissionClient } from './clients/admission'
import { createPublicationClient } from './clients/publication'
import { createAssignmentsClient } from './clients/assignments'
import { createRunsClient } from './clients/runs'
import { createCatalogClient } from './clients/catalog'
import { createImportsClient } from './clients/imports'
import { createBootstrapClient } from './clients/bootstrap'
import { createUpdatesClient } from './clients/updates'
import { createSelfServiceClient } from './clients/self-service'
export function createSoftwareClients(transport: HttpTransport, tenant: string, demo: boolean) {
  return {
    admission: createAdmissionClient(transport),
    publication: createPublicationClient(transport),
    assignments: createAssignmentsClient(transport),
    runs: createRunsClient(transport),
    catalog: createCatalogClient(transport, tenant, demo),
    imports: createImportsClient(transport, tenant, demo),
    bootstrap: createBootstrapClient(transport, tenant, demo),
    updates: createUpdatesClient(transport, tenant, demo),
    selfService: createSelfServiceClient(transport, tenant, demo),
  }
}
