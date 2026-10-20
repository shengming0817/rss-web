import { createRunsClient } from './clients/runs'
import type { HttpTransport } from '@rss/api/mdm'
import { createScopesClient } from './clients/scopes'
import { createResourcesClient } from './clients/resources'
import { createPoliciesClient } from './clients/policies'
import { createNativeClient } from './clients/native'
import { createConfigurationsClient } from './clients/configurations'
import { createExecutionsClient } from './clients/executions'
export function createPolicyClients(transport: HttpTransport, tenant: string, demo: boolean) {
  return {
    runs: createRunsClient(transport),
    scopes: createScopesClient(transport),
    resources: createResourcesClient(transport),
    policies: createPoliciesClient(transport),
    native: createNativeClient(transport),
    configurations: createConfigurationsClient(transport, tenant, demo),
    executions: createExecutionsClient(transport, tenant, demo),
  }
}
