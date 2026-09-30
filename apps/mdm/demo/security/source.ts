import type { DemoDevice } from '../devices/fixtures'
import type { SecuritySource } from '../../src/features/security/clients/source'
export function hasSecuritySource(device: DemoDevice | undefined, source: SecuritySource) {
  return !!device?.registrations.some(
    (r) =>
      r.status === 'active' &&
      r.registrationId === source.registrationId &&
      r.generation === source.generation &&
      r.source === source.source,
  )
}
export function remediationSource(device: DemoDevice | undefined): SecuritySource | null {
  const active =
    device?.registrations.filter((r) => r.status === 'active' && r.source === 'agent.builtin') ?? []
  if (active.length !== 1) return null
  const r = active[0]!
  if (
    !device!.securityBindings?.some(
      (b) =>
        b.registration === r.registrationId &&
        b.generation === r.generation &&
        b.capabilities.includes('security.remediate.v1'),
    )
  )
    return null
  return { registrationId: r.registrationId, generation: r.generation, source: 'agent.builtin' }
}
