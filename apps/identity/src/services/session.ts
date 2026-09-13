import { shallowRef, readonly, computed } from 'vue'
import { isRssApiError, type HttpTransport } from '@rss/api/identity'
import {
  sessionResponse,
  sessionSecurity,
  type SessionSecurity,
  type SessionResponse,
  type Session,
  type Identity,
  uuid,
} from './decode'
export interface SessionState {
  status: 'anonymous' | 'checking' | 'authenticated' | 'unavailable'
  tenant: string | null
  session: Session | null
  identity: Identity | null
  security: SessionSecurity | null
}
export function createSession(transport: HttpTransport) {
  const state = shallowRef<SessionState>({
    status: 'anonymous',
    tenant: null,
    session: null,
    identity: null,
    security: null,
  })
  let csrf: string | undefined
  let generation = 0
  type Control = { scope: string; page: number; promise: Promise<void> }
  let rotation: Control | undefined
  let departure: Control | undefined
  let pending: Promise<unknown> | undefined
  let securityRead: Promise<void> | undefined
  let expiry: ReturnType<typeof setTimeout> | undefined
  let pageGeneration = 0
  function context() {
    const v = state.value
    return v.status === 'authenticated'
      ? [v.tenant, v.identity?.principal_id, v.session?.id].join('/')
      : null
  }
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
    const boundContext = context()
    const boundPage = pageGeneration
    return serial(async () => {
      if (context() !== boundContext || pageGeneration !== boundPage)
        throw new Error('Operation abandoned')
      const expected = generation
      try {
        const result = await work()
        if (generation !== expected || pageGeneration !== boundPage)
          throw new Error('Stale response')
        return result
      } catch (error) {
        if (generation === expected && pageGeneration === boundPage) failure(error)
        throw error
      }
    })
  }
  function clear(status: 'anonymous' | 'unavailable' = 'anonymous') {
    generation++
    csrf = undefined
    clearTimeout(expiry)
    securityRead = undefined
    state.value = {
      status,
      tenant: state.value.tenant,
      session: null,
      identity: null,
      security: null,
    }
  }
  function accept(tenant: string, v: SessionResponse, expected: number) {
    if (generation !== expected) throw new Error('Stale session')
    generation++
    csrf = v.csrf_token
    state.value = {
      status: 'authenticated',
      tenant,
      session: v.session,
      identity: v.identity,
      security: null,
    }
    armExpiry()
  }
  function armExpiry() {
    clearTimeout(expiry)
    const view = state.value.session
    if (!view) return
    const remaining = Math.min(view.idle_expires_at, view.absolute_expires_at) * 1000 - Date.now()
    if (remaining <= 0) {
      clear()
      return
    }
    expiry = setTimeout(armExpiry, Math.min(remaining, 2_147_483_647))
  }
  function leavePage() {
    pageGeneration++
    securityRead = undefined
    state.value = { ...state.value, security: null }
  }
  function loadSecurity(): Promise<void> {
    if (securityRead) return securityRead
    state.value = { ...state.value, security: null }
    let inspectedGeneration = generation
    const inspectedPage = pageGeneration
    const result = perform(async () => {
      inspectedGeneration = generation
      const { tenant, session, status } = state.value
      if (!tenant || !session || status !== 'authenticated') throw new Error('Session required')
      return transport.request({
        method: 'GET',
        path: '/api/v1/tenants/{tenant}/session/security',
        pathParams: { tenant },
        successStatus: 200,
        decode: sessionSecurity,
      })
    })
      .then((value) => {
        if (
          generation !== inspectedGeneration ||
          pageGeneration !== inspectedPage ||
          state.value.status !== 'authenticated' ||
          value.session_id !== state.value.session?.id
        )
          throw new Error('Stale security snapshot')
        state.value = { ...state.value, security: value }
      })
      .finally(() => {
        if (securityRead === result) securityRead = undefined
      })
    securityRead = result
    return result
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
    const scope = context()
    const page = pageGeneration
    const tenant = state.value.tenant
    if (!scope || !tenant) return Promise.reject(new Error('Session required'))
    const running = departure ?? rotation
    if (running)
      return running.scope === scope && running.page === page
        ? running.promise
        : Promise.reject(new Error('Operation abandoned'))
    const promise = serial(async () => {
      if (context() !== scope || pageGeneration !== page) throw new Error('Operation abandoned')
      const expected = generation
      try {
        // Once dispatched, a confirmed same-session rotation still owns its new CSRF across navigation.
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
      if (rotation?.promise === promise) rotation = undefined
    })
    rotation = { scope, page, promise }
    return promise
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
    const scope = context()
    const page = pageGeneration
    const tenant = state.value.tenant
    if (departure)
      return departure.page === page && (scope === departure.scope || scope === null)
        ? departure.promise
        : Promise.reject(new Error('Operation abandoned'))
    if (!scope || !tenant) return Promise.resolve()
    const promise = serial(async () => {
      if (context() !== scope || pageGeneration !== page) throw new Error('Operation abandoned')
      // Read only the current CSRF of the bound session, after any preceding same-session rotation.
      const saved = headers()
      clear()
      const expected = generation
      try {
        await transport.request({
          method: 'POST',
          path: `/api/v1/tenants/{tenant}/${all ? 'sessions/logout-all' : 'session/logout'}`,
          pathParams: { tenant },
          headers: saved,
          successStatus: 204,
        })
        if (generation === expected) clear()
      } catch (error) {
        if (generation === expected) failure(error)
        throw error
      }
    }).finally(() => {
      if (departure?.promise === promise) departure = undefined
    })
    departure = { scope, page, promise }
    return promise
  }
  // Presentation only: these flags already come from the server's scoped management authority.
  const managementHint = computed(
    () =>
      state.value.status === 'authenticated' &&
      !!(state.value.identity?.administrator || state.value.identity?.platform_administrator),
  )
  return {
    state: readonly(state),
    managementHint,
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
    loadSecurity,
    leavePage,
    transport,
  }
}
export type IdentitySession = ReturnType<typeof createSession>
