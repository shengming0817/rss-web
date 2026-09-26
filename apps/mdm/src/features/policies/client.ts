import type { HttpTransport } from '@rss/api/mdm'
import { createScopesClient } from './clients/scopes'
import { createResourcesClient } from './clients/resources'
import { createPoliciesClient } from './clients/policies'
import { createNativeClient } from './clients/native'
import { createCatalogClient } from './clients/catalog'
import { createConfigurationsClient } from './clients/configurations'
import { createWorkflowsClient } from './clients/workflows'
import { createExecutionsClient } from './clients/executions'
export function createPolicyClients(transport: HttpTransport, tenant: string, demo: boolean) {
  return {
    scopes: createScopesClient(transport),
    resources: createResourcesClient(transport),
    policies: createPoliciesClient(transport, tenant, demo),
    native: createNativeClient(transport),
    catalog: createCatalogClient(transport, tenant, demo),
    configurations: createConfigurationsClient(transport, tenant, demo),
    workflows: createWorkflowsClient(transport, tenant, demo),
    executions: createExecutionsClient(transport, tenant, demo),
  }
}
