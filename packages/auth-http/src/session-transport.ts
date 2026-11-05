import type { SessionOwner } from '@rss/auth-core'
import type { HttpTransport, NoContentRequest, RequestOptions } from '@rss/api/identity'

/** Bind this client to the current identity; rotation still uses the sole owner's current CSRF. */
export function bindSession(transport: HttpTransport, owner: SessionOwner): HttpTransport {
  const initial = owner.getSnapshot()
  if (!initial.session || !initial.identity || !initial.tenant) throw new Error('Session required')
  const { tenant, session, identity } = initial
  return {
    request(options: NoContentRequest | RequestOptions<unknown>) {
      return owner.business((credential) => {
        const current = owner.getSnapshot()
        if (
          credential.tenant !== tenant ||
          current.session?.id !== session.id ||
          current.identity?.principalId !== identity.principalId ||
          (options.pathParams?.['tenant'] !== undefined && options.pathParams['tenant'] !== tenant)
        )
          throw new Error('Mismatched session binding')
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
