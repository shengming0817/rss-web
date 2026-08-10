import { createServerAuthorizationPort } from './index'
import { createPreviewAuthorizationPort } from './preview'
import type { AuthorizationHint, AuthorizationIntent, AuthorizationPort } from './index'

const intent: AuthorizationIntent = { contractId: 'runtime.inventory', permission: 'runtime:read' }
const port: AuthorizationPort = createServerAuthorizationPort()
const hint: AuthorizationHint = port.preview(intent)
void hint

createPreviewAuthorizationPort({ enabled: true, scenarios: [] })

// @ts-expect-error Preview activation must be explicit and literal.
createPreviewAuthorizationPort({ enabled: false, scenarios: [] })

// @ts-expect-error Browser intent cannot declare tenant authority.
const tenantIntent: AuthorizationIntent = { ...intent, tenantId: 'tenant' }
void tenantIntent

// @ts-expect-error Browser intent cannot declare principal authority.
const principalIntent: AuthorizationIntent = { ...intent, principal: 'subject' }
void principalIntent

// @ts-expect-error Browser intent cannot carry ABAC attributes or policy input.
const attributeIntent: AuthorizationIntent = { ...intent, attributes: { role: 'admin' } }
void attributeIntent

// The unexported brand makes arbitrary implementations impossible.
// @ts-expect-error AuthorizationPort can only be created by the sealed factories.
const forged: AuthorizationPort = {
  preview: () => ({
    decision: 'unknown',
    source: { kind: 'server', authority: 'deferred-to-request' },
  }),
  execute: (_request, operation) => operation(),
}
void forged
