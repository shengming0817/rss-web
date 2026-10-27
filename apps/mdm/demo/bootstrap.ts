import { createMdm } from '../src/bootstrap'
import { createWorkspaceClient } from '../src/services/workspace'
import { demoKey } from './context'
import { createPolicyClients } from './features/policies/client'
import { createSecurityClients } from './features/security/client'
import { createOperationsClients } from './features/operations/client'
import { enrollmentTargetKey } from '../src/features/enrollment/target'
import { createDemoEnrollmentTargetResolver } from './features/enrollment/target'
import { registerDemoSoftwareAssetRoutes } from './software-assets/routes'
import { navigation, navigationKey } from '../src/components/navigation'
import { registerDemoGroupRoutes } from './features/groups/routes'
export function createDemo(...args: Parameters<typeof createMdm>) {
  const composition = createMdm(...args)
  const { mdm, app, transport, router } = composition
  mdm.workspace = createWorkspaceClient(transport, true)
  if (mdm.realm === 'tenant') {
    registerDemoSoftwareAssetRoutes(router)
    registerDemoGroupRoutes(router)
    app.provide(
      navigationKey,
      navigation.map((section) =>
        section.id === 'software'
          ? {
              ...section,
              items: [
                section.items[0]!,
                { name: 'software-assets', label: 'console.softwareAssets' },
                ...section.items.slice(1),
              ],
            }
          : section,
      ),
    )
    app.provide(enrollmentTargetKey, createDemoEnrollmentTargetResolver(transport))
  }
  app.provide(demoKey, {
    ...mdm,
    policies: createPolicyClients(transport, mdm.tenant, true),
    security: createSecurityClients(transport, mdm.tenant, true),
    operations: createOperationsClients(transport, mdm.tenant, true, mdm.realm),
  })
  return composition
}
