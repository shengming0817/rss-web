import type { HttpTransport } from '@rss/api/mdm'
import { createConfigurationsClient } from './clients/configurations'
import { createNativeClient } from './clients/native'
import { createPackagesClient } from './clients/packages'
export function createOnboardingClients(
  transport: HttpTransport,
  publicTransport: HttpTransport,
  tenant: string,
) {
  return {
    native: createNativeClient(publicTransport),
    configurations: createConfigurationsClient(transport, tenant),
    packages: createPackagesClient(publicTransport, tenant),
  }
}
