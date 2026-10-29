import type { DemoDevice } from './fixtures'
import type { deviceObject } from '../../src/features/devices/clients/objects'
export type DeviceObject = ReturnType<typeof deviceObject>
/** Endpoint provenance stays an endpoint even when its registration is associated. */
export function endpointObject(device: DemoDevice): DeviceObject {
  return {
    object: { kind: 'endpoint', id: device.summary.id },
    associationVersion: null,
    verified: true,
    members: device.registrations
      .filter((r) => r.status === 'active')
      .map((r) => ({
        device: device.summary.id,
        channel: r.source === 'agent.builtin' ? 'agent' : 'mdm',
        registrationId: r.registrationId,
        generation: r.generation,
      })),
  }
}
