import type { HttpTransport } from '@rss/api/mdm'
import { createAssetsClient } from './clients/assets'
import { createDeviceViewsClient } from './clients/device-views'
import { createAssociationsClient } from './clients/associations'
import { createDirectoryClient } from './clients/directory'
import { createEnrollmentClient } from './clients/enrollment'
import { createRegistrationClient } from './clients/registration'
import { createGroupsClient } from './clients/groups'
export function createDeviceClients(transport: HttpTransport, tenant: string) {
  return {
    assets: createAssetsClient(transport, tenant),
    registration: createRegistrationClient(transport, tenant),
    directory: createDirectoryClient(transport),
    views: createDeviceViewsClient(transport, tenant),
    associations: createAssociationsClient(transport),
    enrollment: createEnrollmentClient(transport),
    groups: createGroupsClient(transport),
  }
}
