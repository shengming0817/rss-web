import { createMdm } from '../src/bootstrap'
import { createWorkspaceClient } from '../src/services/workspace'
import { demoKey } from './context'
import { createPolicyClients } from './features/policies/client'
import { createSecurityClients } from './features/security/client'
import { createOperationsClients } from './features/operations/client'
export function createDemo(...args: Parameters<typeof createMdm>) {
  const composition = createMdm(...args)
  const { mdm, app, transport } = composition
  mdm.workspace = createWorkspaceClient(transport, true)
  app.provide(demoKey, {
    ...mdm,
    policies: createPolicyClients(transport, mdm.tenant, true),
    security: createSecurityClients(transport, mdm.tenant, true),
    operations: createOperationsClients(transport, mdm.tenant, true, mdm.realm),
  })
  return composition
}
