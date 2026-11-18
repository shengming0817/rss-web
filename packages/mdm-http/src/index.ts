import type { SessionOwner } from '@rss/auth-core'
import { type HttpTransport, type NoContentRequest, type RequestOptions } from '@rss/api/mdm'

function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value) ||
    value === '00000000-0000-0000-0000-000000000000'
  )
    throw new Error('Invalid host identifier')
  return value
}
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
        const businessPath = options.path.startsWith('/api/v1/tenants/')
        const platformPath = options.path.startsWith('/api/v1/tenant-administration/')
        const state = owner.getSnapshot()
        if (
          state.identity?.principalId !== principalId ||
          state.session?.id !== sessionId ||
          credential.tenant !== tenant ||
          (businessPath && (realm !== 'tenant' || target !== tenant)) ||
          (platformPath && realm !== 'management') ||
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
