import type { HttpTransport, NoContentRequest, RequestOptions } from '@rss/api/mdm'
import type { IdentitySession } from '@rss/auth'
/** The existing session owner coordinates credentials and failure recovery; never replay writes. */
export function bindSession(transport: HttpTransport, session: IdentitySession): HttpTransport {
  return {
    request(options: NoContentRequest | RequestOptions<unknown>) {
      return session.business((headers) =>
        transport.request({
          ...options,
          ...(options.method === 'GET' ? {} : { headers: { ...options.headers, ...headers } }),
        } as RequestOptions<unknown>),
      )
    },
  } as HttpTransport
}
