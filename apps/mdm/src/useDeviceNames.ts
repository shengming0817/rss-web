import { formatFilter, type Filter } from '@rss/api/mdm-filter'
import { referenceKey, type DeviceRef } from '@rss/mdm-devices'
import type { DevicesUseCases } from './EndpointPicker'
import { usePageRead } from './AdminUi'
import { deviceName } from './DevicePresentation'

/** One bounded directory read for the current page; names carry no object authority. */
export function useDeviceNames(devices: DevicesUseCases, references: readonly DeviceRef[]) {
  const refs = new Map(references.map((ref) => [referenceKey(ref), ref]))
  return usePageRead(
    `result-device-names/${JSON.stringify([...refs.keys()].sort())}`,
    async (signal) => {
      const names = new Map<string, string>()
      if (!refs.size) return names
      if (refs.size > 100) throw new Error('Device name page exceeds the directory budget')
      const groups: Filter[] = []
      for (const kind of ['endpoint', 'association'] as const) {
        const ids = [...refs.values()]
          .filter((ref) => ref.kind === kind)
          .map((ref) => ref.id)
          .sort()
        for (let offset = 0; offset < ids.length; offset += 64)
          groups.push({
            kind: 'and',
            children: [
              { kind: 'compare', field: 'reference.kind', operator: '==', values: [kind] },
              {
                kind: 'compare',
                field: 'reference.id',
                operator: '=in=',
                values: ids.slice(offset, offset + 64),
              },
            ],
          })
      }
      const page = await devices.views(
        {
          fields: ['reference', 'endpoints'],
          limit: refs.size,
          filter: formatFilter(groups.length === 1 ? groups[0]! : { kind: 'or', children: groups }),
        },
        signal,
      )
      if (page.nextCursor) throw new Error('Device names exceeded the requested page')
      for (const row of page.items) {
        const key = referenceKey(row.reference)
        if (!refs.has(key)) throw new Error('Wrong device name identity')
        const label = row.endpoints
          ?.map((endpoint) => deviceName(endpoint.displayName, endpoint.id))
          .join(' / ')
        if (label) names.set(key, label)
      }
      return names
    },
    { retryReadConflict: true },
  )
}
