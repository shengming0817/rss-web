import type { HttpTransport } from '@rss/api/mdm'
import { createAssetsClient } from './clients/assets'
import { createDeviceViewsClient } from './clients/device-views'
import { createAssociationsClient } from './clients/associations'
import { createDirectoryClient } from './clients/directory'
import { createEnrollmentClient } from './clients/enrollment'
import { createRegistrationClient } from './clients/registration'
import { createGroupsClient } from './clients/groups'
export function createDeviceClients(transport: HttpTransport, tenant: string, _demo: boolean) {
  return {
    assets: createAssetsClient(transport, tenant),
    registration: createRegistrationClient(transport, tenant),
    directory: createDirectoryClient(transport),
    views: createDeviceViewsClient(transport),
    associations: createAssociationsClient(transport),
    enrollment: createEnrollmentClient(transport),
    groups: createGroupsClient(transport),
  }
}
