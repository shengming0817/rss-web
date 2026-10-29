import type { SessionOwner } from '@rss/auth-core'
import {
  createMdmTransport,
  type HttpTransport,
  type NoContentRequest,
  type RequestOptions,
} from '@rss/api/mdm'

export interface MdmHostConfig {
  readonly canonicalOrigin: string
  readonly tenant: string
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
        Object.keys(value).sort().join() !== 'canonicalOrigin,managementTenant,serviceId,tenant'
      )
        throw new Error('Invalid MDM host configuration')
      const v = value as Record<string, unknown>
      if (
        v['canonicalOrigin'] !== origin ||
        new URL(origin).protocol !== 'https:' ||
        new URL(origin).origin !== origin
      )
        throw new Error('Invalid host origin')
      const tenant = uuid(v['tenant']),
        managementTenant = uuid(v['managementTenant'])
      if (tenant === managementTenant) throw new Error('Invalid tenant binding')
      return Object.freeze({
        canonicalOrigin: origin,
        tenant,
        managementTenant,
        serviceId: uuid(v['serviceId']),
      })
    },
  })
}
export { createMdmTransport }
export interface SessionBinding {
  readonly realm: 'tenant' | 'management'
  readonly credentialTenant: string
  readonly principalId: string
  readonly sessionId: string
}
/** Generated operations consume this adapter, using the application's sole session owner. */
export function bindSession(
  transport: HttpTransport,
  owner: SessionOwner,
  binding: SessionBinding,
): HttpTransport {
  const tenant = uuid(binding.credentialTenant),
    principalId = uuid(binding.principalId),
    sessionId = uuid(binding.sessionId),
    realm = binding.realm
  return {
    request(options: NoContentRequest | RequestOptions<unknown>) {
      return owner.business((credential) => {
        // A management credential may address a business tenant in the registry.
        // The locator is never the credential realm or an authorization decision.
        const registryLocator =
          realm === 'management' &&
          (options.path === '/api/v1/tenant-administration/tenants/{tenant}' ||
            options.path === '/api/v1/tenant-administration/tenants/{tenant}/administrators')
        const target = options.pathParams?.['tenant']
        const state = owner.getSnapshot()
        if (
          state.identity?.principalId !== principalId ||
          state.session?.id !== sessionId ||
          credential.tenant !== tenant ||
          (target !== undefined && target !== tenant && !registryLocator)
        )
          throw new Error('Mismatched business tenant')
        if (target !== undefined) uuid(target)
        return transport.request({
          ...options,
          ...(options.method === 'GET'
            ? {}
            : {
                headers: {
                  ...options.headers,
                  'X-Identity-Request': '1',
                  'X-CSRF-Token': credential.csrf,
                },
              }),
        } as RequestOptions<unknown>)
      })
    },
  } as HttpTransport
}
