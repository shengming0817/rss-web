import type { HttpTransport } from './types'

export interface MdmHostConfig {
  readonly canonicalOrigin: string
  readonly managementTenant: string
  readonly serviceId: string
}
function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value) ||
    value === '00000000-0000-0000-0000-000000000000'
  )
    throw new Error('Invalid host identifier')
  return value
}
export async function loadMdmHostConfig(
  transport: HttpTransport,
  origin: string,
): Promise<MdmHostConfig> {
  return transport.request({
    method: 'GET',
    path: '/api/v1/mdm-host/config.json',
    successStatus: 200,
    decode(value) {
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.keys(value).sort().join() !== 'canonicalOrigin,managementTenant,serviceId'
      )
        throw new Error('Invalid MDM host configuration')
      const v = value as Record<string, unknown>
      if (
        v['canonicalOrigin'] !== origin ||
        new URL(origin).protocol !== 'https:' ||
        new URL(origin).origin !== origin
      )
        throw new Error('Invalid host origin')
      return Object.freeze({
        canonicalOrigin: origin,
        managementTenant: uuid(v['managementTenant']),
        serviceId: uuid(v['serviceId']),
      })
    },
  })
}
export function mdmTenantFromPath(pathname: string, managementTenant: string): string | null {
  const tenant = /^\/tenants\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?:\/|$)/.exec(
    pathname,
  )?.[1]
  return tenant && tenant !== managementTenant && tenant !== '00000000-0000-0000-0000-000000000000'
    ? tenant
    : null
}
