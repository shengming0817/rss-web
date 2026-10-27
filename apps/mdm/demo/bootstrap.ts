import { createMdm } from '../src/bootstrap'
import { createWorkspaceClient } from '../src/services/workspace'
import { demoKey } from './context'
import { createPolicyClients } from './features/policies/client'
import { createSecurityClients } from './features/security/client'
import { createOperationsClients } from './features/operations/client'
import { routes as policies } from './features/policies/routes'
export function createDemo(...args: Parameters<typeof createMdm>) {
  const composition = createMdm(...args)
  const { mdm, app, router, transport } = composition
  mdm.workspace = createWorkspaceClient(transport, true)
  for (const route of policies) router.addRoute(route)
  app.provide(demoKey, {
    ...mdm,
    policies: createPolicyClients(transport, mdm.tenant, true),
    security: createSecurityClients(transport, mdm.tenant, true),
    operations: createOperationsClients(transport, mdm.tenant, true, mdm.realm),
  })
  return composition
}
