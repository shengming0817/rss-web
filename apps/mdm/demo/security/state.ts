import type { createDeviceDemo } from '../devices/state'
import type { createOperationsDemo } from '../operations/state'
import type { createScopeDemo } from '../policies/scopes'
import type { DemoEvent, DomainHandler, Scenario } from '../scenario'
import { createComplianceDemo } from './compliance'
import { createCertificateArchiveDemo } from './certificate-archive'
import { createSecurityRequests } from './requests'
import { createGovernanceDemo } from './governance'
import { createRisksDemo } from './risks'
import { createSecurityActions } from './actions'
import { createSupportDemo } from './support'
import { isSupportTarget } from '../features/security/clients/support-model'
export function createSecurityDemo(
  devices: ReturnType<typeof createDeviceDemo>,
  operations: ReturnType<typeof createOperationsDemo>,
  scopes: ReturnType<typeof createScopeDemo>,
) {
  let time = Math.floor(Date.now() / 1000)
  const now = () => (time = Math.max(time, Math.floor(Date.now() / 1000)))
  const compliance = createComplianceDemo(devices, operations, now)
  const certificateArchive = createCertificateArchiveDemo(now)
  const requests = createSecurityRequests(
    now,
    (target): boolean =>
      target.kind === 'compliance_exception'
        ? governance.valid(target)
        : target.kind === 'risk_remediation'
          ? risks.valid(target)
          : isSupportTarget(target)
            ? support.valid(target)
            : false,
    operations,
  )
  const governance = createGovernanceDemo(now, scopes, compliance, requests, operations)
  const risks = createRisksDemo(now, devices, operations)
  const support = createSupportDemo(now, devices, requests, operations)
  const actions = createSecurityActions(now, devices, requests, risks, support, operations)
  const handle: DomainHandler = (request, scenario) => {
    for (const owner of [
      compliance,
      certificateArchive,
      governance,
      requests,
      risks,
      actions,
      support,
    ]) {
      const reply = owner.handle(request, scenario)
      if (reply) return reply
    }
  }
  return {
    now,
    compliance,
    governance,
    requests,
    risks,
    actions,
    support,
    // Settle once before public projections; blocksDisclosure stays a non-recursive predicate.
    settle() {
      requests.settle()
      actions.settle()
    },
    executions: actions.executions,
    handle,
    tick(event: DemoEvent, scenario: Scenario) {
      time = Math.max(now(), event.at)
      requests.settle()
      const accepted = support.tick(event, scenario)
      actions.tick(event, scenario)
      return !['remote_consent', 'remote_revoke'].includes(event.kind) || accepted
    },
    reset() {
      for (const owner of [
        compliance,
        certificateArchive,
        governance,
        requests,
        risks,
        actions,
        support,
      ])
        owner.reset()
      time = Math.floor(Date.now() / 1000)
    },
  }
}
