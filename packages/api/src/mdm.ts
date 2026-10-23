/** MDM browser protocol policy over the shared HTTP executor. No retries. */
import axios from 'axios'
import { isMdmContentRequest, MDM_CONTENT_BODY_LIMIT, mdmJsonBodyLimit } from './mdm-limits'
import { decodeIdentityError } from './identity'
import { execute } from './transport'
import { clientError, identityWireFailure, agentWireFailure, protocolError } from './wire-error'
import type { HttpTransport, NoContentRequest, RequestOptions, RssApiError } from './types'
export type {
  BinaryResponse,
  HttpTransport,
  NoContentRequest,
  RequestOptions,
  RssApiError,
} from './types'
export { isRssApiError } from './wire-error'
const statuses: Readonly<Record<string, number>> = {
  malformed_request: 400,
  configuration_target_limit: 400,
  invalid_certificate_request: 400,
  archive_material_invalid: 400,
  archive_key_mismatch: 400,
  archive_password_rejected: 403,
  archive_locked: 423,
  archive_not_found: 404,
  archive_integrity_error: 500,
  invalid_identity: 401,
  permission_denied: 403,
  inventory_not_found: 404,
  operation_not_found: 404,
  first_use_operation_not_found: 404,
  first_use_not_ready: 409,
  task_not_found: 404,
  management_device_not_found: 404,
  group_not_found: 404,
  scope_not_found: 404,
  policy_not_found: 404,
  plan_preview_not_found: 404,
  resource_not_found: 404,
  software_source_not_found: 404,
  software_publication_not_found: 404,
  group_rule_not_found: 404,
  agent_package_installer_mismatch: 409,
  agent_package_lifecycle_not_admitted: 409,
  agent_package_source_not_admitted: 409,
  agent_package_binding_not_admitted: 409,
  operation_conflict: 409,
  mdm_software_disabled: 409,
  recovery_credential_not_found: 404,
  recovery_credential_integrity: 500,
  device_view_cursor_invalidated: 409,
  upload_offset_conflict: 409,
  capability_unknown: 409,
  platform_unsupported: 409,
  stale_plan: 409,
  owner_conflict: 409,
  request_limited: 429,
  registration_limit: 429,
  enrollment_paused: 409,
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
  /^\/api\/v1\/(?:(?:user-attribute-definitions|user-attribute-operations|user-profiles|authorization|devices|device-views|device-retirements|api-keys|device-associations|certificate-archive|asset-fields|asset-field-layout|device-queries|saved-queries|groups|scopes|policies|compliance-rules|resources|software|enrollments|registration-quotas|registration-channels)(?:\/|$)|operations$|collection-blueprints$|self-enrollments$|agent-(?:configurations|configuration-operations|enrollment-settings)(?:\/|$)|apple\/organizations(?:\/|$)|windows\/entra-policy$|windows\/entra\/terms\/context$|agent\/enroll\/packages(?:\/\{id\})?$|mdm-host\/config\.json$|mdm-candidate\/(?:workspace|devices|groups|policies|executions|software|security\/(?:baselines|support|risks|actions|requests)|support|authorization)(?:\/|$)|mdm-candidate\/operations\/(?:metrics|reports|alert-rules|alerts)(?:\/|$))/
export function createMdmTransport(): HttpTransport {
  const instance = axios.create({ baseURL: '' })
  return {
    async request(options: NoContentRequest | RequestOptions<unknown>) {
      const connections =
        (options.method === 'GET' &&
          [
            '/api/v1/agent-connections',
            '/api/v1/agent-connections/configuration',
            '/api/v1/agent-connections/devices',
            '/api/v1/agent-connections/devices/{device}/observation',
            '/api/v1/agent-connection-operations/{id}',
          ].includes(options.path)) ||
        (options.method === 'PUT' && options.path === '/api/v1/agent-connections') ||
        (options.method === 'POST' && options.path === '/api/v1/agent-connections/publish')
      const readiness = options.path === '/readyz'
      const settings =
        /^\/api\/v1\/(?:settings\/(?:catalog$|first-use(?:\/|$))|tenant-administration(?:\/|$)|apple\/materials(?:\/|$)|apple\/material-operations(?:\/|$)|storage\/connections(?:\/|$)|smtp(?:\/|$)|windows\/wns(?:\/|$)|task-signing(?:\/|$)|pki(?:\/|$)|webhooks(?:\/|$)|runtime\/diagnostics$|agent-packages(?:\/|$))/.test(
          options.path,
        )
      const agentRecovery =
        options.method === 'POST' &&
        /^\/api\/v1\/(?:agent-registrations\/\{registration\}\/recovery|agent-issuances\/\{issuance\}\/recover)$/.test(
          options.path,
        )
      const recoveryQuery =
        options.method === 'GET' &&
        options.path === '/api/v1/agent-issuances/{issuance}/recovery-operations/{operation}'
      const audit = options.method === 'GET' && options.path === '/api/v1/audit-events'
      const telemetry = [
        '/api/v1/telemetry/resources',
        '/api/v1/telemetry/history',
        '/api/v1/telemetry/aggregate',
        '/api/v1/telemetry/health',
        '/api/v1/telemetry/gaps/query',
        '/api/v1/asset-retention-policies',
        '/api/v1/asset-retention-policies/{key}/{revision}',
      ].includes(options.path)
      if (
        !paths.test(options.path) &&
        !connections &&
        !settings &&
        !readiness &&
        !telemetry &&
        !audit &&
        !agentRecovery &&
        !recoveryQuery
      )
        throw clientError()
      const publicRead =
        options.path.startsWith('/api/v1/agent/enroll/packages') ||
        options.path === '/api/v1/windows/entra/terms/context' ||
        readiness ||
        options.path === '/api/v1/mdm-host/config.json'
      if (
        publicRead &&
        (options.method !== 'GET' ||
          options.body !== undefined ||
          Object.keys(options.headers ?? {}).length)
      )
        throw clientError()
      if (
        options.responseType === 'arraybuffer' &&
        !(
          (options.method === 'POST' && options.path === '/api/v1/agent-configurations') ||
          (options.method === 'GET' &&
            options.path === '/api/v1/agent-connections/configuration') ||
          (options.method === 'POST' && options.path === '/api/v1/enrollments/{id}/profile') ||
          (options.method === 'GET' &&
            options.path === '/api/v1/apple/organizations/{id}/ade/public-key') ||
          (options.method === 'GET' &&
            options.path === '/api/v1/software/resources/{id}/versions/{version}/content')
        )
      )
        throw clientError()
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
        new TextEncoder().encode(JSON.stringify(options.body)).byteLength >
          mdmJsonBodyLimit(options.method, options.path)
      )
        throw decodeMdmError(413, undefined)
      return execute(
        instance,
        30_000,
        options,
        options.path.startsWith('/api/v1/agent-') ? decodeAgentError : decodeMdmError,
      )
    },
  } as HttpTransport
}

/** Agent management has its own closed failure envelope, including issuance identity. */
export function decodeAgentError(status: number, value: unknown): RssApiError {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const v = value as Record<string, unknown>
    const agentStatuses: Readonly<Record<string, number>> = {
      malformed_request: 400,
      invalid_identity: 401,
      permission_denied: 403,
      grant_revoked: 403,
      grant_expired: 403,
      registration_limit: 429,
      enrollment_paused: 409,
      connection_deployment_unobserved: 409,
      connection_retirement_blocked: 409,
      operation_conflict: 409,
      device_view_cursor_invalidated: 409,
      issuance_unknown: 503,
      activation_unknown: 503,
      service_unavailable: 503,
      credential_revoked: 401,
      retired: 401,
      certificate_expired: 401,
    }
    if (
      Object.keys(v).sort().join() === 'code,issuanceId' &&
      typeof v['code'] === 'string' &&
      agentStatuses[v['code']] === status &&
      (v['issuanceId'] === null ||
        (typeof v['issuanceId'] === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v['issuanceId'])))
    )
      return agentWireFailure(
        status,
        v['code'],
        typeof v['issuanceId'] === 'string' ? v['issuanceId'] : undefined,
      )
  }
  return decodeMdmError(status, value)
}
