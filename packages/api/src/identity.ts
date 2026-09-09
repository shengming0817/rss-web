/** Identity browser transport. A separate endpoint set over the single network executor. */
import axios from 'axios'
import { execute } from './transport'
import { clientError, identityWireFailure, protocolError } from './wire-error'
import type { HttpTransport, NoContentRequest, RequestOptions, RssApiError } from './types'
export type { HttpTransport, RssApiError, RequestOptions, NoContentRequest } from './types'
export { isRssApiError } from './wire-error'
const statuses: Readonly<Record<string, number>> = {
  malformed_request: 400,
  invalid_credential: 401,
  invalid_client: 401,
  csrf_rejected: 403,
  identity_not_active: 403,
  insufficient_privilege: 403,
  reauthentication_failed: 403,
  last_administrator: 409,
  configuration_changed: 409,
  provider_limit_reached: 409,
  identity_link_conflict: 409,
  rate_limited: 429,
  identity_unavailable: 503,
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export function decodeIdentityError(
  status: number,
  value: unknown,
  downstream: boolean,
): RssApiError {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return protocolError(status)
  const v = value as Record<string, unknown>
  if (
    Object.keys(v).sort().join(',') !== (downstream ? 'code,correlation_id' : 'code') ||
    typeof v['code'] !== 'string' ||
    statuses[v['code']] !== status
  )
    return protocolError(status)
  if (downstream && (typeof v['correlation_id'] !== 'string' || !uuid.test(v['correlation_id'])))
    return protocolError(status)
  return identityWireFailure(
    status,
    v['code'],
    downstream ? (v['correlation_id'] as string) : undefined,
  )
}
export function createIdentityTransport(): HttpTransport {
  const instance = axios.create({ baseURL: '' })
  return {
    async request(options: NoContentRequest | RequestOptions<unknown>) {
      const downstream = /^\/api\/v1\/downstream\/(?:login|consent)(?:\/accept)?$/.test(
        options.path,
      )
      if (
        (!downstream && !options.path.startsWith('/api/v1/tenants/{tenant}/')) ||
        options.session !== undefined ||
        options.errorPolicy !== undefined
      )
        throw clientError()
      const headers = Object.keys(options.headers ?? {}).map((v) => v.toLowerCase())
      if (headers.some((v) => !['x-identity-request', 'x-csrf-token'].includes(v)))
        throw clientError()
      return execute(
        instance,
        30_000,
        { ...options, cache: 'no-store' },
        (status, value) => decodeIdentityError(status, value, downstream),
        {},
      )
    },
  } as HttpTransport
}
