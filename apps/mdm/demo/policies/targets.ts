import type { createDeviceDemo } from '../devices/state'
import type { Channel } from '../../src/features/devices/clients/objects'
export function targetFacts(
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts' | 'objects'>,
  id: string,
  channel: Channel,
) {
  const endpoint = devices.facts().find((d) => d.summary.id === id)
  const registration = endpoint?.registrations.find(
    (r) => r.status === 'active' && (r.source === 'agent.builtin' ? 'agent' : 'mdm') === channel,
  )
  const sources = devices.objects().filter((o) => o.members.some((m) => m.device === id))
  const unverified = sources.some((o) => !o.verified)
  const target =
    registration && !unverified
      ? {
          device: id,
          channel,
          registrationId: registration.registrationId,
          generation: registration.generation,
        }
      : null
  return {
    object: { kind: 'endpoint' as const, id },
    channel,
    availability: target ? 'ready' : 'unavailable',
    reason: target ? null : unverified ? 'association_unverified' : 'missing_registration',
    target,
    sources,
  }
}
