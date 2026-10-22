import type { HttpTransport } from '@rss/api/mdm'
import { createSoftwareContentClient } from './clients/content'
import { createLifecycleClient } from './clients/lifecycle'
import { createPublicationClient } from './clients/publication'
import { createImportsClient } from './clients/imports'
import { createRolloutClient } from './clients/rollout'
export function createSoftwareClients(transport: HttpTransport) {
  return {
    lifecycle: createLifecycleClient(transport),
    content: createSoftwareContentClient(transport),
    publication: createPublicationClient(transport),
    imports: createImportsClient(transport),
    rollout: createRolloutClient(transport),
  }
}
