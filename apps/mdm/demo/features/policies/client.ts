import type { HttpTransport } from '@rss/api/mdm'
import { createPolicyClients as createFormalClients } from '../../../src/features/policies/client'
import { createConfigurationsClient } from './clients/configurations'
export function createPolicyClients(transport: HttpTransport, tenant: string, demo: boolean) {
  return {
    ...createFormalClients(transport),
    configurations: createConfigurationsClient(transport, tenant, demo),
  }
}
