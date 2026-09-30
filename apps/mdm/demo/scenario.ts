/** MOCK_SOURCE: synthetic HTTP server, never part of a production entry. */
import type { DemoEvent } from './policies/schedule'
import {
  MDM_JSON_BODY_LIMIT,
  MDM_CONTENT_BODY_LIMIT,
  isMdmContentRequest,
} from '@rss/api/mdm-limits'
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
export type DomainHandler = (request: DemoRequest, scenario: Scenario) => Reply | undefined
export function createScenario(
  handlers: DomainHandler[] = [],
  resetDomains: () => void = () => {},
  advance: (event: DemoEvent, scenario: Scenario) => void = () => {},
  observed: (method: string, path: string, scenario: Scenario) => void = () => {},
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
      new TextEncoder().encode(JSON.stringify(body)).byteLength > MDM_JSON_BODY_LIMIT
    )
      return { status: 413 }
    const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    if (path === '/api/mdm-candidate/v1/workspace/scenario' && method === 'GET')
      return { status: 200, body: { scenario: active, sources: { ...sources } } }
    if (path === '/api/mdm-candidate/v1/workspace/scenario' && method === 'POST') {
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
            'software_request',
            'bootstrap_continue',
            'bootstrap_detect',
            'enrollment_bind',
            'agent_binding',
          ].includes(event.kind ?? '') ||
          typeof event.at !== 'number' ||
          !Number.isSafeInteger(event.at) ||
          event.at < 0 ||
          event.at > 8640000000000 ||
          (event.kind !== 'clock' && (typeof event.device !== 'string' || !event.device)) ||
          (event.kind === 'software_detect' &&
            (typeof event.task !== 'string' ||
              !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
                event.task,
              ))) ||
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
              typeof event.active !== 'boolean')) ||
          (event.kind === 'software_request' &&
            (typeof event.item !== 'string' ||
              !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(event.item)))
        )
          return { status: 400, body: { code: 'malformed_request' } }
        if (
          ['enrollment_bind', 'agent_binding'].includes(event.kind!) &&
          sources['devices'] !== 'mock'
        )
          return { status: 409, body: { code: 'operation_conflict' } }
        advance(event as DemoEvent, active)
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
          // Resource, Scope and execution endpoints are shared; source choices move together.
          if (['policies', 'software'].includes(data['module'])) {
            sources['policies'] = data['source']
            sources['software'] = data['source']
          }
        }
      }
      return { status: 204 }
    }
    const loginPath = `/api/v2/tenants/${TENANT}/login`
    if (path === loginPath && method === 'POST') {
      if (!['demo', 'reviewer'].includes(String(data['login'])) || data['password'] !== 'demo')
        return { status: 401, body: { code: 'invalid_credential' } }
      signedIn = true
      principalId = data['login'] === 'reviewer' ? REVIEWER : PRINCIPAL
      sessionId = crypto.randomUUID()
      epoch++
      return { status: 200, body: session() }
    }
    if (!signedIn)
      return {
        status: 401,
        body: {
          code: path.startsWith('/api/v2/tenants/') ? 'invalid_credential' : 'invalid_identity',
        },
      }
    if (path.startsWith('/api/identity-host/v1/tenants/'))
      return {
        status: 200,
        body: {
          tenantId: TENANT,
          principalId,
          sessionId,
          navigation: { manageAccounts: false, manageProviders: false },
        },
      }
    if (path === `/api/v2/tenants/${TENANT}/session` && method === 'GET')
      return { status: 200, body: session() }
    if (method !== 'GET') {
      if (headers['x-csrf-token'] !== token || headers['x-identity-request'] !== '1')
        return { status: 403, body: { code: 'csrf_rejected' } }
      if (
        path.startsWith(`/api/v2/tenants/${TENANT}/session/`) &&
        (path.endsWith('/logout') || path.endsWith('/logout-all'))
      ) {
        signedIn = false
        epoch++
        return { status: 204 }
      }
      if (
        path.startsWith(`/api/v2/tenants/${TENANT}/session/`) &&
        (path.endsWith('/refresh') || path.endsWith('/reauthenticate'))
      ) {
        epoch++
        return { status: 200, body: session() }
      }
    }
    if (path === `/api/v2/tenants/${TENANT}/sessions`)
      return { status: 200, body: { sessions: [session().session], nextCursor: null } }
    const expected = epoch
    if (active === 'late') await new Promise((resolve) => setTimeout(resolve, 1500))
    if (epoch !== expected) return { status: 409, body: { code: 'operation_conflict' } }
    if (active === 'forbidden') return { status: 403, body: { code: 'permission_denied' } }
    if (active === 'offline') return { status: 503, body: { code: 'service_unavailable' } }
    if (active === 'unsupported') return { status: 501, body: { code: 'action_not_supported' } }
    if (method !== 'GET' && active === 'conflict')
      return { status: 409, body: { code: 'operation_conflict' } }
    const unknownReply = method !== 'GET' && active === 'unknown'
    if (path === '/api/mdm-candidate/v1/workspace' && method === 'GET')
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
    const policyPath =
      /^\/api\/(?:v2\/(?:scopes|policies)(?:\/|$)|v3\/(?:resources)(?:\/|$)|v2\/devices\/[^/]+\/operations(?:\/|$)|mdm-candidate\/v1\/(?:policies|executions)(?:\/|$))/.test(
        path,
      )
    const softwarePath =
      /^\/api\/(?:v3\/software(?:\/|$)|v1\/software-sources(?:\/|$)|v2\/policies(?:\/|$)|mdm-candidate\/v1\/software(?:\/|$))/.test(
        path,
      )
    const securityPath =
      /^\/api\/v2\/(?:compliance-rules(?:\/|$)|devices\/[^/]+\/compliance(?:\/|$))/.test(path)
    const module = securityPath
      ? 'security'
      : softwarePath
        ? 'software'
        : policyPath
          ? 'policies'
          : /^\/api\/(?:v2\/(?:asset-fields|device-queries|devices|saved-queries|groups)|v3\/(?:enrollments|devices))(?:\/|$)/.test(
                path,
              )
            ? 'devices'
            : path.startsWith('/api/mdm-candidate/v1/groups')
              ? 'devices'
              : path.split('/')[4]
    if (module && sources[module] === 'real')
      return { status: 503, body: { code: 'service_unavailable' } }
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
        if (reply.status >= 200 && reply.status < 300) observed(method, path, active)
        return unknownReply && reply.status >= 200 && reply.status < 300
          ? { status: 503, body: { code: 'operation_unknown' } }
          : reply
      }
    }
    if (unknownReply) return { status: 503, body: { code: 'operation_unknown' } }
    return { status: 501, body: { code: 'action_not_supported' } }
  }
  return {
    handle,
    reset,
    set(value: Scenario) {
      active = value
    },
  }
}
