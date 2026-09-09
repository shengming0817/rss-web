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
  let pending: Promise<unknown> | undefined
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const result = pending ? pending.then(work, work) : work()
    const settled = result.then(
      () => undefined,
      () => undefined,
    )
    pending = settled
    void settled.then(() => {
      if (pending === settled) pending = undefined
    })
    return result
  }
  function perform<T>(work: () => Promise<T>): Promise<T> {
    return serial(async () => {
      const expected = generation
      try {
        const result = await work()
        if (generation !== expected) throw new Error('Stale response')
        return result
      } catch (error) {
        if (generation === expected) failure(error)
        throw error
      }
    })
  }
  function clear(status: 'anonymous' | 'unavailable' = 'anonymous') {
    generation++
    csrf = undefined
    state.value = { status, tenant: state.value.tenant, session: null, identity: null }
  }
  function accept(tenant: string, v: SessionResponse, expected: number) {
    if (generation !== expected) throw new Error('Stale session')
    generation++
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
    if (departure) return departure
    if (rotation) return rotation
    if (state.value.tenant === null) return Promise.reject(new Error('Session required'))
    rotation = serial(async () => {
      const tenant = state.value.tenant
      if (tenant === null) throw new Error('Session required')
      const expected = generation
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
    }).finally(() => {
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
    departure = serial(async () => {
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
    }).finally(() => {
      departure = undefined
    })
    return departure
  }
  return {
    state: readonly(state),
    check: (tenant: string) => serial(() => check(tenant)),
    login: (tenant: string, loginKey: string, password: string) =>
      serial(() => login(tenant, loginKey, password)),
    clear,
    headers,
    refresh,
    activity,
    logout,
    failure,
    perform,
    transport,
  }
}
export type IdentitySession = ReturnType<typeof createSession>
