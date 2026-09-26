/** MOCK_SOURCE: synthetic HTTP server, never part of a production entry. */
export const TENANT = '11111111-1111-4111-8111-111111111111'
const PRINCIPAL = '22222222-2222-4222-8222-222222222222'
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
  method: string
  path: string
  body: unknown
  query: URLSearchParams
}
export type DomainHandler = (request: DemoRequest, scenario: Scenario) => Reply | undefined
export function createScenario(handlers: DomainHandler[] = []) {
  let active: Scenario = 'normal'
  let signedIn = false
  let epoch = 0
  let token = '0'.repeat(64)
  const sources: Record<string, 'real' | 'mock'> = {
    devices: 'mock',
    policies: 'mock',
    security: 'mock',
    operations: 'mock',
  }
  function reset() {
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
        id: PRINCIPAL,
        authTime: 1,
        idleExpiresAt: 4102444800,
        absoluteExpiresAt: 4102444900,
      },
      identity: { principalId: PRINCIPAL, hasLocalPassword: true },
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
    const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    if (path === '/api/mdm-candidate/v1/workspace/scenario' && method === 'GET')
      return { status: 200, body: { scenario: active, sources: { ...sources } } }
    if (path === '/api/mdm-candidate/v1/workspace/scenario' && method === 'POST') {
      if (data['reset'] === true) reset()
      else {
        if (!scenarios.includes(data['scenario'] as Scenario))
          return { status: 400, body: { code: 'malformed_request' } }
        active = data['scenario'] as Scenario
        if (
          typeof data['module'] === 'string' &&
          data['module'] in sources &&
          (data['source'] === 'real' || data['source'] === 'mock')
        )
          sources[data['module']] = data['source']
      }
      return { status: 204 }
    }
    const loginPath = `/api/v2/tenants/${TENANT}/login`
    if (path === loginPath && method === 'POST') {
      if (data['login'] !== 'demo' || data['password'] !== 'demo')
        return { status: 401, body: { code: 'invalid_credential' } }
      signedIn = true
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
          principalId: PRINCIPAL,
          sessionId: PRINCIPAL,
          navigation: { manageAccounts: false, manageProviders: false },
        },
      }
    if (path === `/api/v2/tenants/${TENANT}/session` && method === 'GET')
      return { status: 200, body: session() }
    if (method !== 'GET' && path.startsWith('/api/v2/tenants/')) {
      if (headers['x-csrf-token'] !== token || headers['x-identity-request'] !== '1')
        return { status: 403, body: { code: 'csrf_rejected' } }
      if (path.endsWith('/logout') || path.endsWith('/logout-all')) {
        signedIn = false
        epoch++
        return { status: 204 }
      }
      if (path.endsWith('/refresh') || path.endsWith('/reauthenticate')) {
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
    if (method !== 'GET' && active === 'unknown')
      return { status: 503, body: { code: 'operation_unknown' } }
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
    const module = path.split('/')[4]
    if (module && sources[module] === 'real')
      return { status: 503, body: { code: 'service_unavailable' } }
    for (const handler of handlers) {
      const reply = handler({ method, path, body, query: parsed.searchParams }, active)
      if (reply) return reply
    }
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
