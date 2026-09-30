import type { createDeviceDemo } from '../devices/state'
import type { createOperationsDemo } from '../operations/state'
import type { createScopeDemo } from '../policies/scopes'
import type { DemoEvent } from '../policies/schedule'
import type { DomainHandler, Scenario } from '../scenario'
import { createComplianceDemo } from './compliance'
import { createSecurityRequests } from './requests'
import { createGovernanceDemo } from './governance'
import { createRisksDemo } from './risks'
import { createSecurityActions } from './actions'
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
    (target): boolean =>
      target.kind === 'compliance_exception' ? governance.valid(target) : risks.valid(target),
    operations,
  )
  const governance = createGovernanceDemo(now, scopes, compliance, requests, operations)
  const risks = createRisksDemo(now, devices, operations)
  const actions = createSecurityActions(now, devices, requests, risks, operations)
  const handle: DomainHandler = (request, scenario) => {
    for (const owner of [compliance, governance, requests, risks, actions]) {
      const reply = owner.handle(request, scenario)
      if (reply) return reply
    }
  }
  return {
    compliance,
    governance,
    requests,
    risks,
    actions,
    executions: actions.executions,
    handle,
    tick(event: DemoEvent, scenario: Scenario) {
      time = Math.max(now(), event.at)
      requests.settle()
      actions.tick(event, scenario)
    },
    reset() {
      for (const owner of [compliance, governance, requests, risks, actions]) owner.reset()
      time = Math.floor(Date.now() / 1000)
    },
  }
}
