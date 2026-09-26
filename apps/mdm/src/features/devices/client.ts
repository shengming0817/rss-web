import type { HttpTransport } from '@rss/api/mdm'
import { createAssetsClient } from './clients/assets'
import { createDirectoryClient } from './clients/directory'
import { createEnrollmentClient } from './clients/enrollment'
import { createGroupsClient } from './clients/groups'
export function createDeviceClients(transport: HttpTransport, tenant: string, demo: boolean) {
  return {
    assets: createAssetsClient(transport, tenant),
    directory: createDirectoryClient(transport, tenant, demo),
    enrollment: createEnrollmentClient(transport),
    groups: createGroupsClient(transport),
  }
}
