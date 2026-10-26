import type { ReadScalar, Evidence } from './clients/asset-model'
import type { DeviceView } from './clients/device-views'
export function utc(at: number | null | undefined): string {
  if (at == null) return '—'
  const date = new Date(at * 1000)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toISOString().replace('T', ' ').replace('.000Z', ' UTC')
}
export function scalarText(value: ReadScalar): string {
  if (value.kind === 'array') return value.value.map(scalarText).join(', ')
  if (value.kind === 'object')
    return Object.entries(value.value)
      .map(([key, item]) => `${key}: ${scalarText(item)}`)
      .join(' · ')
  if (value.kind === 'time') return utc(value.value)
  return String(value.value)
}
export function currentEvidence(view: DeviceView, endpoint: string, evidence: Evidence) {
  if (evidence.source === 'manual') return false
  const channel = evidence.source.startsWith('agent.') ? 'agent' : 'mdm'
  return (
    view.endpoints
      .find((e) => e.id === endpoint)
      ?.channels.some(
        (c) =>
          c.channel === channel &&
          c.status === 'active' &&
          c.registrationId === evidence.registration &&
          c.generation === evidence.registrationGeneration,
      ) ?? false
  )
}
export function receivedAt(view: DeviceView, endpoint: string) {
  const evidence = [
    ...Object.values(view.fields).flatMap((f) =>
      f.sources.map((s) => ({ endpoint: s.endpoint, evidence: s.fact.evidence })),
    ),
    ...Object.values(view.lists).flatMap((f) => f.sources),
  ].filter((s) => s.endpoint === endpoint && currentEvidence(view, endpoint, s.evidence))
  return evidence.length ? Math.max(...evidence.map((s) => s.evidence.receivedAt)) : null
}
export function addresses(items: ReadScalar[]) {
  return [
    ...new Set(
      items.flatMap((item) => {
        if (item.kind !== 'object') return []
        const array = item.value['addresses']
        return array?.kind === 'array'
          ? array.value.flatMap((v) => (v.kind === 'string' ? [v.value] : []))
          : ['ipv4', 'ipv6'].flatMap((key) => {
              const v = item.value[key]
              return v?.kind === 'string' && v.value ? [v.value] : []
            })
      }),
    ),
  ]
}
