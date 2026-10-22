import { createProfilesClient } from './clients/profiles'
import type { HttpTransport } from '@rss/api/mdm'
import type { IdentitySession } from '@rss/auth'
import { createSettingsCatalog, type Realm } from './clients/catalog'
import { createPlatformClient } from './clients/platform'
import { createAppleMaterials } from './clients/apple'
import { createStorageClient, createMailClient, createWnsClient } from './clients/providers'
import { createWebhookMaterials } from './clients/webhook'
import { createTaskTrustClient } from './clients/trust'
import { createPkiClient } from './clients/pki'
import { createRuntimeDiagnostics } from './clients/runtime'
import { createManagedPackages } from './clients/packages'
import { createFirstUseClient } from './clients/firstUse'
import { createSettingsOperations } from './operations'

export function createSettingsClients(
  transport: HttpTransport,
  publicTransport: HttpTransport,
  session: IdentitySession,
  tenant: string,
  realm: Realm,
) {
  return {
    profiles: createProfilesClient(transport),
    firstUse: createFirstUseClient(transport, tenant),
    runtime: createRuntimeDiagnostics(transport),
    packages: createManagedPackages(transport, tenant),
    catalog: createSettingsCatalog(transport, publicTransport, realm),
    platform: createPlatformClient(transport),
    apple: createAppleMaterials(transport),
    storage: createStorageClient(transport),
    mail: createMailClient(transport),
    wns: createWnsClient(transport),
    webhook: createWebhookMaterials(transport),
    task: createTaskTrustClient(transport, tenant),
    pki: createPkiClient(transport, tenant),
    operations: createSettingsOperations(session),
  }
}
