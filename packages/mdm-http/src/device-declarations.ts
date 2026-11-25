import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import type { DeclarationsPort, DdmItem } from '@rss/mdm-devices/declarations'
export function createDeviceDeclarationsAdapter(
  transport: HttpTransport,
  tenant: string,
): DeclarationsPort {
  return {
    declarations: (device, cursor, signal) =>
      api.getApiV1TenantsByTenantDevicesByDeviceDdm(
        transport,
        {
          pathParams: { tenant, device },
          query: { limit: 100, ...(cursor ? { cursor } : {}) },
          ...(signal ? { signal } : {}),
        },
        (value) => ({
          ...value,
          items: value.items.map((item): DdmItem => {
            if (
              item.deviceId !== device ||
              item.observation.protocol !== 'mdm.apple' ||
              item.observation.observationScope !== 'declarations'
            )
              throw new Error('Wrong DDM declaration observation')
            return { ...item, observation: item.observation }
          }),
        }),
      ),
  }
}
