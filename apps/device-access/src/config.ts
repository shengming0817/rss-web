import type { HttpTransport } from '@rss/api/mdm'
export interface DaHost {
  canonicalOrigin: string
  tenant: string
  serviceId: string
}
export function decodeHost(value: unknown, origin: string): DaHost {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid host')
  const v = value as Record<string, unknown>
  if (
    Object.keys(v).sort().join() !== 'canonicalOrigin,managementTenant,serviceId,tenant' ||
    v['canonicalOrigin'] !== origin ||
    new URL(origin).protocol !== 'https:'
  )
    throw new Error('Invalid host')
  const id = (key: string) => {
    const x = v[key]
    if (
      typeof x !== 'string' ||
      x === '00000000-0000-0000-0000-000000000000' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)
    )
      throw new Error('Invalid host')
    return x
  }
  const tenant = id('tenant')
  if (tenant === id('managementTenant')) throw new Error('Invalid host')
  return { canonicalOrigin: origin, tenant, serviceId: id('serviceId') }
}
export function loadHost(transport: HttpTransport, origin: string) {
  return transport.request({
    method: 'GET',
    path: '/api/v1/mdm-host/config.json',
    successStatus: 200,
    decode: (v) => decodeHost(v, origin),
  })
}
