import { createMdmDemoTransport } from '@rss/api/mdm-demo'
import { createMdm } from '../src/bootstrap'
import { createDemoWorkspaceClient } from './workspace'
import { demoKey } from './context'
import { createSecurityClients } from './features/security/client'
import { createOperationsClients } from './features/operations/client'
import { enrollmentTargetKey } from '../src/features/enrollment/target'
import { createDemoEnrollmentTargetResolver } from './features/enrollment/target'
import { registerDemoSoftwareAssetRoutes } from './software-assets/routes'
import { navigation, navigationKey } from '../src/components/navigation'
import { registerDemoGroupRoutes } from './features/groups/routes'
export function createDemo(...args: Parameters<typeof createMdm>) {
  const composition = createMdm(args[0], args[1], args[2], createMdmDemoTransport())
  const { mdm, app, transport, router } = composition
  mdm.workspace = createDemoWorkspaceClient(transport)
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
    transport,
    security: createSecurityClients(transport, mdm.tenant, true),
    operations: createOperationsClients(transport, mdm.tenant, true, mdm.realm),
  })
  return composition
}
