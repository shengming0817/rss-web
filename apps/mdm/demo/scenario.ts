/** MOCK_SOURCE: synthetic HTTP server, never part of a production entry. */
import { observationTarget } from './operations/observation'
import type { OperationsReference } from '../src/features/operations/clients/model'
import type { DemoEvent } from './policies/schedule'
import { mdmJsonBodyLimit, MDM_CONTENT_BODY_LIMIT, isMdmContentRequest } from '@rss/api/mdm-limits'
export const TENANT = '11111111-1111-4111-8111-111111111111'
const PRINCIPAL = '22222222-2222-4222-8222-222222222222'
const REVIEWER = '33333333-3333-4333-8333-333333333333'
export const scenarios = [
  'normal',
  'empty',
  'forbidden',
  'denied',
  'offline',
  'unsupported',
  'partial',
  'conflict',
  'unknown',
  'late',
] as const
export type Scenario = (typeof scenarios)[number]
export interface Reply {
  status: number
  body?: unknown
}
export interface DemoRequest {
  actor: { principalId: string; sessionId: string }
  method: string
  path: string
  body: unknown
  query: URLSearchParams
  headers: Record<string, string | string[] | undefined>
}
export interface DemoObservation {
  actor: { principalId: string; sessionId: string }
  method: string
  path: string
  operation: string | null
  target: OperationsReference | null
  at: number
  status: number
  outcome: 'accepted' | 'denied' | 'failed' | 'unknown'
  stream: 'identity_security' | 'mdm_business'
}
export type DomainHandler = (request: DemoRequest, scenario: Scenario) => Reply | undefined
export function createScenario(
  handlers: DomainHandler[] = [],
  resetDomains: () => void = () => {},
  advance: (event: DemoEvent, scenario: Scenario) => boolean = () => true,
  observed: (event: DemoObservation, scenario: Scenario) => void = () => {},
  now: () => number = () => Math.floor(Date.now() / 1000),
) {
  let active: Scenario = 'normal'
  let signedIn = false
  let principalId = PRINCIPAL
  let sessionId = crypto.randomUUID()
  let epoch = 0
  let token = '0'.repeat(64)
  const sources: Record<string, 'real' | 'mock'> = {
    devices: 'mock',
    policies: 'mock',
    software: 'mock',
    security: 'mock',
    operations: 'mock',
  }
  function reset() {
    resetDomains()
    signedIn = false
    active = 'normal'
    epoch++
    token = '0'.repeat(64)
    Object.keys(sources).forEach((key) => {
      sources[key] = 'mock'
    })
  }
  function session() {
    token = (epoch + 1).toString(16).padStart(64, '0')
    return {
      session: {
        id: sessionId,
        authTime: 1,
        idleExpiresAt: 4102444800,
        absoluteExpiresAt: 4102444900,
      },
      identity: { principalId, hasLocalPassword: true },
      csrfToken: token,
    }
  }
  async function handle(
    method: string,
    url: string,
    body?: unknown,
    headers: Record<string, string | string[] | undefined> = {},
  ): Promise<Reply> {
    const parsed = new URL(url, 'http://demo.invalid')
    const path = parsed.pathname
    const content = isMdmContentRequest(method, path)
    if (content) {
      if (!(body instanceof ArrayBuffer) || body.byteLength === 0)
        return { status: 400, body: { code: 'malformed_request' } }
      if (body.byteLength > MDM_CONTENT_BODY_LIMIT) return { status: 413 }
    } else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      return { status: 400, body: { code: 'malformed_request' } }
    } else if (
      body !== undefined &&
      new TextEncoder().encode(JSON.stringify(body)).byteLength > mdmJsonBodyLimit(method, path)
    )
      return { status: 413 }
    const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}

    function observedReply(reply: Reply, stream: DemoObservation['stream'] = 'mdm_business') {
      const valid = (v: unknown): v is string =>
        typeof v === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)
      const operation =
        valid(data['operationId']) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(data['operationId'])
          ? data['operationId']
          : null
      const target =
        stream === 'identity_security'
          ? { kind: 'identity_principal' as const, id: principalId, device: null, revision: null }
          : observationTarget(path, operation)
      observed(
        {
          actor: { principalId, sessionId },
          method,
          path,
          operation,
          target,
          at: now(),
          status: reply.status,
          outcome:
            reply.status < 300
              ? 'accepted'
              : reply.status === 403
                ? 'denied'
                : (reply.body as { code?: string } | undefined)?.code === 'operation_unknown'
                  ? 'unknown'
                  : 'failed',
          stream,
        },
        active,
      )
      return reply
    }
    if (path === '/api/v1/mdm-candidate/workspace/scenario' && method === 'GET')
      return { status: 200, body: { scenario: active, sources: { ...sources }, asOf: now() } }
    if (path === '/api/v1/mdm-candidate/workspace/scenario' && method === 'POST') {
      if (!signedIn) return { status: 401, body: { code: 'invalid_identity' } }
      if (headers['x-csrf-token'] !== token || headers['x-identity-request'] !== '1')
        return { status: 403, body: { code: 'csrf_rejected' } }
      if (data['event'] !== undefined) {
        if (!signedIn) return { status: 401, body: { code: 'invalid_identity' } }
        if (sources['policies'] !== 'mock')
          return { status: 409, body: { code: 'operation_conflict' } }
        const event = data['event'] as Partial<DemoEvent> | null
        if (
          !event ||
          ![
            'clock',
            'registration',
            'check_in',
            'software_start',
            'software_detect',
            'software_reboot',
            'software_usage',
            'bootstrap_continue',
            'bootstrap_detect',
            'enrollment_bind',
            'agent_binding',
            'security_result',
            'security_detect',
            'material_detect',
            'certificate_issued',
            'certificate_detect',
            'remote_consent',
            'remote_revoke',
            'remote_ended',
            'support_detect',
            'elevation_used',
            'elevation_ended',
            'elevation_revoked',
            'diagnostic_uploaded',
            'diagnostic_scanned',
          ].includes(event.kind ?? '') ||
          typeof event.at !== 'number' ||
          !Number.isSafeInteger(event.at) ||
          event.at < 0 ||
          event.at > 8640000000000 ||
          (event.kind !== 'clock' && (typeof event.device !== 'string' || !event.device)) ||
          ([
            'software_detect',
            'security_result',
            'security_detect',
            'material_detect',
            'certificate_issued',
            'certificate_detect',
            'remote_consent',
            'remote_revoke',
            'remote_ended',
            'support_detect',
            'elevation_used',
            'elevation_ended',
            'elevation_revoked',
            'diagnostic_uploaded',
            'diagnostic_scanned',
          ].includes(event.kind ?? '') &&
            (typeof event.task !== 'string' ||
              !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
                event.task,
              ))) ||
          (event.kind === 'remote_consent' && typeof event.active !== 'boolean') ||
          (event.kind === 'agent_binding' && typeof event.active !== 'boolean') ||
          (event.kind === 'enrollment_bind' &&
            (typeof event.enrollment !== 'string' ||
              !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
                event.enrollment,
              ))) ||
          (event.kind === 'software_usage' &&
            (typeof event.resource !== 'string' ||
              !event.resource ||
              event.resource.length > 256 ||
              typeof event.active !== 'boolean'))
        )
          return { status: 400, body: { code: 'malformed_request' } }
        if (
          ['enrollment_bind', 'agent_binding'].includes(event.kind!) &&
          sources['devices'] !== 'mock'
        )
          return { status: 409, body: { code: 'operation_conflict' } }
        if (!advance(event as DemoEvent, active))
          return { status: 409, body: { code: 'operation_conflict' } }
        return { status: 204 }
      }
      if (data['reset'] === true) reset()
      else {
        if (!scenarios.includes(data['scenario'] as Scenario))
          return { status: 400, body: { code: 'malformed_request' } }
        active = data['scenario'] as Scenario
        if (
          typeof data['module'] === 'string' &&
          data['module'] in sources &&
          (data['source'] === 'real' || data['source'] === 'mock')
        ) {
          sources[data['module']] = data['source']
          // Executions, approvals, audit and alerts have one owner across these domains.
          if (['policies', 'software', 'security', 'operations'].includes(data['module']))
            for (const module of ['policies', 'software', 'security', 'operations'])
              sources[module] = data['source']
        }
      }
      return { status: 204 }
    }
    const loginPath = `/api/v1/identity/tenants/${TENANT}/login`
    if (path === loginPath && method === 'POST') {
      if (!['demo', 'reviewer'].includes(String(data['login'])) || data['password'] !== 'demo')
        return { status: 401, body: { code: 'invalid_credential' } }
      signedIn = true
      principalId = data['login'] === 'reviewer' ? REVIEWER : PRINCIPAL
      sessionId = crypto.randomUUID()
      epoch++
      return observedReply({ status: 200, body: session() }, 'identity_security')
    }
    if (!signedIn)
      return {
        status: 401,
        body: {
          code: path.startsWith('/api/v1/identity/tenants/')
            ? 'invalid_credential'
            : 'invalid_identity',
        },
      }
    if (path.startsWith('/api/v1/identity-host/tenants/'))
      return {
        status: 200,
        body: {
          tenantId: TENANT,
          principalId,
          sessionId,
          navigation: { manageAccounts: false, manageProviders: false },
        },
      }
    if (path === `/api/v1/identity/tenants/${TENANT}/session` && method === 'GET')
      return { status: 200, body: session() }
    if (method !== 'GET') {
      if (headers['x-csrf-token'] !== token || headers['x-identity-request'] !== '1')
        return { status: 403, body: { code: 'csrf_rejected' } }
      if (
        path.startsWith(`/api/v1/identity/tenants/${TENANT}/session/`) &&
        (path.endsWith('/logout') || path.endsWith('/logout-all'))
      ) {
        signedIn = false
        epoch++
        return { status: 204 }
      }
      if (
        path.startsWith(`/api/v1/identity/tenants/${TENANT}/session/`) &&
        (path.endsWith('/refresh') || path.endsWith('/reauthenticate'))
      ) {
        epoch++
        return { status: 200, body: session() }
      }
    }
    if (path === `/api/v1/identity/tenants/${TENANT}/accounts` && method === 'GET')
      return principalId === PRINCIPAL
        ? {
            status: 200,
            body: {
              accounts: [
                {
                  principalId: PRINCIPAL,
                  login: 'demo',
                  enabled: true,
                  memberActive: true,
                  hasLocalPassword: true,
                },
                {
                  principalId: REVIEWER,
                  login: 'reviewer',
                  enabled: true,
                  memberActive: true,
                  hasLocalPassword: true,
                },
              ],
              nextCursor: null,
            },
          }
        : { status: 403, body: { code: 'permission_denied' } }
    if (path === `/api/v1/identity/tenants/${TENANT}/sessions`)
      return { status: 200, body: { sessions: [session().session], nextCursor: null } }
    const expected = epoch
    if (active === 'late') await new Promise((resolve) => setTimeout(resolve, 1500))
    if (epoch !== expected) return { status: 409, body: { code: 'operation_conflict' } }
    function fault(): Reply | undefined {
      if (active === 'forbidden') return { status: 403, body: { code: 'permission_denied' } }
      if (active === 'offline') return { status: 503, body: { code: 'service_unavailable' } }
      if (active === 'unsupported') return { status: 501, body: { code: 'action_not_supported' } }
      if (method !== 'GET' && active === 'conflict')
        return { status: 409, body: { code: 'operation_conflict' } }
    }
    const unknownReply = method !== 'GET' && active === 'unknown'
    if (path === '/api/v1/mdm-candidate/workspace' && method === 'GET') {
      const failure = fault()
      if (failure) return failure
      return {
        status: 200,
        body: {
          modules: Object.entries(sources).map(([id, source]) => ({
            id,
            source,
            available: active === 'partial' ? null : active !== 'denied',
          })),
        },
      }
    }
    const policyPath =
      /^\/api\/(?:v1\/(?:scopes|policies)(?:\/|$)|v1\/(?:resources)(?:\/|$)|v1\/devices\/[^/]+\/operations(?:\/|$)|v1\/mdm-candidate\/(?:policies|executions)(?:\/|$))/.test(
        path,
      )
    const softwarePath =
      /^\/api\/(?:v1\/software(?:\/|$)|v1\/software-sources(?:\/|$)|v1\/policies(?:\/|$)|v1\/mdm-candidate\/software(?:\/|$))/.test(
        path,
      )
    const securityPath =
      /^\/api\/v1\/(?:compliance-rules(?:\/|$)|devices\/[^/]+\/compliance(?:\/|$))/.test(path)
    const operationsPath =
      /^\/api\/(?:v1\/authorization(?:\/|$)|v1\/mdm-candidate\/(?:authorization|audit|operations|integrations)(?:\/|$))/.test(
        path,
      )
    const module = operationsPath
      ? 'operations'
      : securityPath
        ? 'security'
        : softwarePath
          ? 'software'
          : policyPath
            ? 'policies'
            : /^\/api\/(?:v1\/(?:asset-fields|device-queries|devices|saved-queries|groups)|v1\/(?:enrollments|devices|self-enrollments|registration-quotas))(?:\/|$)/.test(
                  path,
                )
              ? 'devices'
              : path.startsWith('/api/v1/mdm-candidate/groups')
                ? 'devices'
                : path.split('/')[4]
    if (module && sources[module] === 'real')
      return { status: 503, body: { code: 'service_unavailable' } }
    const failure = fault()
    if (failure) return observedReply(failure)
    for (const handler of handlers) {
      const reply = handler(
        {
          method,
          path,
          body,
          query: parsed.searchParams,
          headers,
          actor: { principalId, sessionId },
        },
        active,
      )
      if (reply) {
        return observedReply(
          unknownReply && reply.status >= 200 && reply.status < 300
            ? { status: 503, body: { code: 'operation_unknown' } }
            : reply,
        )
      }
    }
    if (unknownReply) return observedReply({ status: 503, body: { code: 'operation_unknown' } })
    return observedReply({ status: 501, body: { code: 'action_not_supported' } })
  }
  return {
    handle,
    reset,
    set(value: Scenario) {
      active = value
    },
  }
}
