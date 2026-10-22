import { createRunsClient } from './clients/runs'
import type { HttpTransport } from '@rss/api/mdm'
import { createScopesClient } from './clients/scopes'
import { createResourcesClient } from './clients/resources'
import { createPoliciesClient } from './clients/policies'
import { createNativeClient } from './clients/native'
import { createExecutionsClient } from './clients/executions'
export function createPolicyClients(transport: HttpTransport) {
  return {
    runs: createRunsClient(transport),
    scopes: createScopesClient(transport),
    resources: createResourcesClient(transport),
    policies: createPoliciesClient(transport),
    native: createNativeClient(transport),
    executions: createExecutionsClient(transport),
  }
}
