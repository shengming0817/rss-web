import { shallowRef, readonly } from 'vue'
import { isRssApiError, type HttpTransport } from '@rss/api/identity'
import { sessionResponse, type SessionResponse, type Session, type Identity, uuid } from './decode'
export interface SessionState {
  status: 'anonymous' | 'checking' | 'authenticated' | 'unavailable'
  tenant: string | null
  session: Session | null
  identity: Identity | null
}
export function createSession(transport: HttpTransport) {
  const state = shallowRef<SessionState>({
    status: 'anonymous',
    tenant: null,
    session: null,
    identity: null,
  })
  let csrf: string | undefined
  let generation = 0
  let rotation: Promise<void> | undefined
  let departure: Promise<void> | undefined
  function clear(status: 'anonymous' | 'unavailable' = 'anonymous') {
    generation++
    csrf = undefined
    state.value = { status, tenant: state.value.tenant, session: null, identity: null }
  }
  function accept(tenant: string, v: SessionResponse, expected: number) {
    if (generation !== expected) throw new Error('Stale session')
    csrf = v.csrf_token
    state.value = { status: 'authenticated', tenant, session: v.session, identity: v.identity }
  }
  function failure(error: unknown) {
    if (isRssApiError(error) && error.status === 401) clear()
    else if (
      !isRssApiError(error) ||
      error.status === 503 ||
      ['network', 'timeout', 'protocol'].includes(error.cause)
    )
      clear('unavailable')
  }
  async function check(tenant: string) {
    if (departure) await departure
    tenant = uuid(tenant)
    clear()
    const expected = generation
    state.value = { ...state.value, status: 'checking', tenant }
    try {
      accept(
        tenant,
        await transport.request({
          method: 'GET',
          path: '/api/v1/tenants/{tenant}/session',
          pathParams: { tenant },
          successStatus: 200,
          decode: sessionResponse,
        }),
        expected,
      )
    } catch (error) {
      if (generation === expected) {
        failure(error)
        if (isRssApiError(error) && error.status === 401) return
      }
      throw error
    }
  }
  async function login(tenant: string, login: string, password: string) {
    await rotation
    if (departure) await departure
    tenant = uuid(tenant)
    const expected = ++generation
    try {
      accept(
        tenant,
        await transport.request({
          method: 'POST',
          path: '/api/v1/tenants/{tenant}/login',
          pathParams: { tenant },
          headers: headers(false),
          body: { login, password },
          successStatus: 200,
          decode: sessionResponse,
        }),
        expected,
      )
    } catch (error) {
      if (generation === expected) failure(error)
      throw error
    }
  }
  function headers(required = true): Record<string, string> {
    if (required && (state.value.status !== 'authenticated' || csrf === undefined))
      throw new Error('Session required')
    return { 'X-Identity-Request': '1', ...(csrf === undefined ? {} : { 'X-CSRF-Token': csrf }) }
  }
  function refresh(): Promise<void> {
    if (rotation) return rotation
    const tenant = state.value.tenant
    if (tenant === null) return Promise.reject(new Error('Session required'))
    const expected = generation
    rotation = (async () => {
      try {
        accept(
          tenant,
          await transport.request({
            method: 'POST',
            path: '/api/v1/tenants/{tenant}/session/refresh',
            pathParams: { tenant },
            headers: headers(),
            successStatus: 200,
            decode: sessionResponse,
          }),
          expected,
        )
      } catch (error) {
        if (generation === expected) {
          clear()
          failure(error)
        }
        throw error
      }
    })().finally(() => {
      rotation = undefined
    })
    return rotation
  }
  async function activity() {
    const s = state.value.session
    if (
      state.value.status === 'authenticated' &&
      s &&
      s.idle_expires_at * 1000 - Date.now() < 120_000
    )
      await refresh()
  }
  function logout(all = false): Promise<void> {
    if (departure) return departure
    departure = (async () => {
      await rotation
      const tenant = state.value.tenant
      if (tenant === null) return
      const saved = headers()
      clear()
      try {
        await transport.request({
          method: 'POST',
          path: `/api/v1/tenants/{tenant}/${all ? 'sessions/logout-all' : 'session/logout'}`,
          pathParams: { tenant },
          headers: saved,
          successStatus: 204,
        })
        clear()
      } catch (error) {
        failure(error)
        throw error
      }
    })().finally(() => {
      departure = undefined
    })
    return departure
  }
  return {
    state: readonly(state),
    check,
    login,
    clear,
    headers,
    refresh,
    activity,
    logout,
    failure,
    generation: () => generation,
    ready: async () => {
      await rotation
      await departure
    },
    transport,
  }
}
export type IdentitySession = ReturnType<typeof createSession>
