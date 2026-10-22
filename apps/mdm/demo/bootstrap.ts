import { createMdm } from '../src/bootstrap'
import { createWorkspaceClient } from '../src/services/workspace'
import { navigationKey } from '../src/components/navigation'
import { navigation } from './navigation'
import { demoKey } from './context'
import { createPolicyClients } from './features/policies/client'
import { createSecurityClients } from './features/security/client'
import { createOperationsClients } from './features/operations/client'
import { routes as policies } from './features/policies/routes'
import { routes as security } from './features/security/routes'
import { routes as operations } from './features/operations/routes'
export function createDemo(...args: Parameters<typeof createMdm>) {
  const composition = createMdm(...args)
  const { mdm, router, app, transport } = composition
  mdm.workspace = createWorkspaceClient(transport, true)
  for (const route of [...policies, ...security, ...operations]) router.addRoute(route)
  app.provide(navigationKey, navigation)
  app.provide(demoKey, {
    ...mdm,
    policies: createPolicyClients(transport, mdm.tenant, true),
    security: createSecurityClients(transport, mdm.tenant, true),
    operations: createOperationsClients(transport, mdm.tenant, true, mdm.realm),
  })
  return composition
}
