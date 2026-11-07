import type { DeviceRef } from '@rss/mdm-devices'
import type { DevicesUseCases } from './EndpointPicker'
import { usePageRead } from './AdminUi'
import { deviceName } from './DevicePresentation'

/** One bounded directory read for the current page; names carry no object authority. */
export function useDeviceNames(devices: DevicesUseCases, references: readonly DeviceRef[]) {
  const keys = [...new Set(references.map((ref) => `${ref.kind}:${ref.id}`))].sort()
  return usePageRead(
    `result-device-names/${JSON.stringify(keys)}`,
    async (signal) => {
      const names = new Map<string, string>()
      if (!keys.length) return names
      if (keys.length > 100) throw new Error('Device name page exceeds the directory budget')
      const literal = (value: string) =>
        `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
      const page = await devices.views(
        {
          fields: ['key', 'reference', 'endpoints'],
          limit: keys.length,
          filter: keys.map((key) => `key==${literal(key)}`).join(','),
        },
        signal,
      )
      if (page.nextCursor) throw new Error('Device names exceeded the requested page')
      for (const row of page.items) {
        if (!keys.includes(row.key)) throw new Error('Wrong device name identity')
        const label = row.endpoints
          ?.map((endpoint) => deviceName(endpoint.displayName, endpoint.id))
          .join(' / ')
        if (label) names.set(row.key, label)
      }
      return names
    },
    { retryReadConflict: true },
  )
}
