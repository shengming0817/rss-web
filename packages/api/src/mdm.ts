/** MDM browser protocol policy over the shared HTTP executor. No retries. */
import axios from 'axios'
import { isMdmContentRequest, MDM_CONTENT_BODY_LIMIT, MDM_JSON_BODY_LIMIT } from './mdm-limits'
import { decodeIdentityError } from './identity'
import { execute } from './transport'
import { clientError, identityWireFailure, protocolError } from './wire-error'
import type { HttpTransport, NoContentRequest, RequestOptions, RssApiError } from './types'
export type { HttpTransport, NoContentRequest, RequestOptions, RssApiError } from './types'
export { isRssApiError } from './wire-error'
const statuses: Readonly<Record<string, number>> = {
  malformed_request: 400,
  configuration_target_limit: 400,
  invalid_certificate_request: 400,
  invalid_identity: 401,
  permission_denied: 403,
  inventory_not_found: 404,
  operation_not_found: 404,
  task_not_found: 404,
  management_device_not_found: 404,
  group_not_found: 404,
  scope_not_found: 404,
  policy_not_found: 404,
  plan_preview_not_found: 404,
  resource_not_found: 404,
  software_source_not_found: 404,
  software_candidate_not_found: 404,
  group_rule_not_found: 404,
  operation_conflict: 409,
  upload_offset_conflict: 409,
  capability_unknown: 409,
  platform_unsupported: 409,
  stale_plan: 409,
  owner_conflict: 409,
  request_limited: 429,
  audit_integrity_error: 500,
  audit_contract_error: 500,
  action_not_supported: 501,
  operation_unknown: 503,
  operation_rollback_unconfirmed: 503,
  service_unavailable: 503,
}
export function decodeMdmError(status: number, value: unknown): RssApiError {
  // Ingress may reject before the JSON handler and return an HTML body.
  if (status === 413) return identityWireFailure(413, 'request_too_large')
  const identity = decodeIdentityError(status, value)
  if (identity.cause === 'wire') return identity
  if (!value || typeof value !== 'object' || Array.isArray(value)) return protocolError(status)
  const v = value as Record<string, unknown>
  if (typeof v['code'] !== 'string' || statuses[v['code']] !== status) return protocolError(status)
  const keys = Object.keys(v).sort().join()
  if (v['code'] === 'upload_offset_conflict')
    return keys === 'code,offset' &&
      typeof v['offset'] === 'number' &&
      Number.isSafeInteger(v['offset']) &&
      v['offset'] >= 0
      ? identityWireFailure(status, v['code'])
      : protocolError(status)
  const plan = [
    'capability_unknown',
    'platform_unsupported',
    'stale_plan',
    'owner_conflict',
  ].includes(v['code'])
  if (
    keys !== 'code' &&
    !(
      plan &&
      keys === 'code,device,stage' &&
      (v['device'] === null || typeof v['device'] === 'string') &&
      (v['stage'] === null || typeof v['stage'] === 'string')
    )
  )
    return protocolError(status)
  return identityWireFailure(status, v['code'])
}
const paths =
  /^\/api\/(?:v1\/(?:authorization|devices|software-sources)(?:\/|$)|v2\/(?:asset-fields|device-queries|devices|saved-queries|groups|scopes|policies|compliance-rules)(?:\/|$)|v3\/(?:resources|software|enrollments|devices)(?:\/|$)|mdm-host\/v1\/config\.json$|mdm-candidate\/v1\/(?:workspace|devices|groups|policies|executions|software|security|support|authorization|audit|operations|integrations)(?:\/|$))/
export function createMdmTransport(): HttpTransport {
  const instance = axios.create({ baseURL: '' })
  return {
    async request(options: NoContentRequest | RequestOptions<unknown>) {
      if (!paths.test(options.path)) throw clientError()
      const content = isMdmContentRequest(options.method, options.path)
      if (
        Object.entries(options.headers ?? {}).some(
          ([key, value]) =>
            !['x-identity-request', 'x-csrf-token', 'idempotency-key'].includes(
              key.toLowerCase(),
            ) &&
            !(
              content &&
              key.toLowerCase() === 'content-type' &&
              value === 'application/octet-stream'
            ),
        )
      )
        throw clientError()
      if (content) {
        if (!(options.body instanceof ArrayBuffer) || !options.body.byteLength) throw clientError()
        if (options.body.byteLength > MDM_CONTENT_BODY_LIMIT) throw decodeMdmError(413, undefined)
        return execute(
          instance,
          30_000,
          {
            ...options,
            headers: { ...options.headers, 'Content-Type': 'application/octet-stream' },
          },
          decodeMdmError,
        )
      }
      if (
        options.body instanceof ArrayBuffer ||
        ArrayBuffer.isView(options.body) ||
        (typeof Blob !== 'undefined' && options.body instanceof Blob)
      )
        throw clientError()
      if (
        options.body !== undefined &&
        new TextEncoder().encode(JSON.stringify(options.body)).byteLength > MDM_JSON_BODY_LIMIT
      )
        throw decodeMdmError(413, undefined)
      return execute(instance, 30_000, options, decodeMdmError)
    },
  } as HttpTransport
}
