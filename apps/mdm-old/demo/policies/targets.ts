import type { createDeviceDemo } from '../devices/state'
import { objectKey, type Channel } from '../../src/features/devices/clients/objects'
import type { DeviceObject } from '../devices/objects'
export function targetFacts(
  devices: Pick<ReturnType<typeof createDeviceDemo>, 'facts' | 'objects'>,
  object: DeviceObject,
  channel: Channel,
) {
  const facts = devices.facts(),
    current =
      object.object.kind === 'association'
        ? devices.objects().find((o) => objectKey(o.object) === objectKey(object.object))
        : undefined
  const verified =
    object.verified &&
    (object.object.kind === 'endpoint' ||
      (!!current?.verified && current.associationVersion === object.associationVersion))
  const coordinates = object.members.every((m) =>
    facts.some(
      (d) =>
        d.summary.id === m.device &&
        d.registrations.some(
          (r) =>
            r.status === 'active' &&
            r.registrationId === m.registrationId &&
            r.generation === m.generation,
        ),
    ),
  )
  const target =
    verified && coordinates ? (object.members.find((m) => m.channel === channel) ?? null) : null
  return {
    object: object.object,
    channel,
    availability: target ? ('ready' as const) : ('unavailable' as const),
    reason: !verified
      ? 'association_unverified'
      : !coordinates
        ? 'source_pending'
        : !target
          ? 'channel_unavailable'
          : null,
    target,
    sources: [object],
  }
}
