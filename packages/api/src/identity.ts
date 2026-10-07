/** Identity browser transport. The only endpoint set over the network executor. */
import axios from 'axios'
import { execute } from './transport'
import { clientError, identityWireFailure, protocolError } from './wire-error'
import type { HttpTransport, NoContentRequest, RequestOptions, RssApiError } from './types'
export type { HttpTransport, RssApiError, RequestOptions, NoContentRequest } from './types'
export { isRssApiError } from './wire-error'
const statuses: Readonly<Record<string, number>> = {
  malformed_request: 400,
  invalid_credential: 401,
  csrf_rejected: 403,
  insufficient_privilege: 403,
  reauthentication_required: 403,
  reauthentication_failed: 403,
  configuration_changed: 409,
  provider_limit_reached: 409,
  account_already_exists: 409,
  identity_link_conflict: 409,
  rate_limited: 429,
  identity_unavailable: 503,
}
export function decodeIdentityError(status: number, value: unknown): RssApiError {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return protocolError(status)
  const v = value as Record<string, unknown>
  if (
    Object.keys(v).join() !== 'code' ||
    typeof v['code'] !== 'string' ||
    statuses[v['code']] !== status
  )
    return protocolError(status)
  return identityWireFailure(status, v['code'])
}
export function createIdentityTransport(): HttpTransport {
  const instance = axios.create({ baseURL: '' })
  return {
    async request(options: NoContentRequest | RequestOptions<unknown>) {
      if ('responseType' in options) throw clientError()
      const read =
        options.method === 'GET' &&
        (options.path === '/api/v1/identity-host/config.json' ||
          options.path === '/api/v1/identity-host/tenants/{tenant}/context')
      if (!read && !options.path.startsWith('/api/v1/identity/tenants/{tenant}/'))
        throw clientError()
      const headers = Object.keys(options.headers ?? {}).map((v) => v.toLowerCase())
      if (headers.some((v) => !['x-identity-request', 'x-csrf-token'].includes(v)))
        throw clientError()
      return execute(instance, 30_000, options, (status, value) =>
        decodeIdentityError(status, value),
      )
    },
  } as HttpTransport
}
