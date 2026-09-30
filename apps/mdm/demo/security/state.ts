import type { createDeviceDemo } from '../devices/state'
import type { createOperationsDemo } from '../operations/state'
import type { createScopeDemo } from '../policies/scopes'
import type { DemoEvent } from '../policies/schedule'
import type { DomainHandler } from '../scenario'
import { createComplianceDemo } from './compliance'
import { createSecurityRequests } from './requests'
import { createGovernanceDemo } from './governance'
export function createSecurityDemo(
  devices: ReturnType<typeof createDeviceDemo>,
  operations: ReturnType<typeof createOperationsDemo>,
  scopes: ReturnType<typeof createScopeDemo>,
) {
  let time = Math.floor(Date.now() / 1000)
  const now = () => (time = Math.max(time, Math.floor(Date.now() / 1000)))
  const compliance = createComplianceDemo(devices, operations)
  const requests = createSecurityRequests(
    now,
    (target): boolean => governance.valid(target),
    operations,
  )
  const governance = createGovernanceDemo(now, scopes, compliance, requests, operations)
  const handle: DomainHandler = (request, scenario) => {
    for (const owner of [compliance, governance, requests]) {
      const reply = owner.handle(request, scenario)
      if (reply) return reply
    }
  }
  return {
    compliance,
    governance,
    requests,
    handle,
    tick(event: DemoEvent) {
      time = Math.max(now(), event.at)
      requests.settle()
    },
    reset() {
      for (const owner of [compliance, governance, requests]) owner.reset()
      time = Math.floor(Date.now() / 1000)
    },
  }
}
