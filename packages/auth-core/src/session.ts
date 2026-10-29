import type { AuthPort, SessionEnvelope, SessionState, StepUpOperation } from './model'

/** One authority owner. Controls exclude business requests; neither path replays writes. */
export function createSession(
  port: AuthPort,
  options: { oidcEnabled: boolean; now?: () => number },
) {
  const now = options.now ?? Date.now
  const listeners = new Set<() => void>()
  let state: SessionState = Object.freeze({
    status: 'anonymous',
    tenant: null,
    session: null,
    identity: null,
    host: null,
    security: null,
    navigation: 'idle',
    invalidated: false,
    logoutOutcome: 'idle',
  })
  let csrf: string | undefined
  let generation = 0
  let page = 0
  let selection = 0
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Promise<void> | undefined
  let rotation: Promise<void> | undefined
  let departure: Promise<void> | undefined
  const leases = new Set<Promise<void>>()
  function publish(patch: Partial<SessionState>) {
    state = Object.freeze({ ...state, ...patch })
    for (const listener of listeners) listener()
  }
  function clear(status: 'anonymous' | 'unavailable' = 'anonymous', invalidated = false) {
    generation++
    csrf = undefined
    clearTimeout(timer)
    publish({
      status,
      session: null,
      identity: null,
      host: null,
      security: null,
      navigation: 'idle',
      invalidated,
    })
  }
  function assertLive(expected: number) {
    if (disposed || expected !== generation) throw new Error('Operation abandoned')
  }
  function scope() {
    return state.status === 'authenticated'
      ? `${state.tenant}/${state.identity?.principalId}/${state.session?.id}`
      : null
  }
  function credentials() {
    if (state.status !== 'authenticated' || !state.tenant || !csrf)
      throw new Error('Session required')
    return { tenant: state.tenant, csrf }
  }
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const drained = async () => {
      await Promise.all([...leases])
      return work()
    }
    const result = pending ? pending.then(drained, drained) : drained()
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
  function expire() {
    clearTimeout(timer)
    if (!state.session) return
    const remaining =
      Math.min(state.session.idleExpiresAt, state.session.absoluteExpiresAt) * 1000 - now()
    if (remaining <= 0) {
      clear('anonymous', true)
      return
    }
    timer = setTimeout(expire, Math.min(remaining, 2_147_483_647))
  }
  function accept(tenant: string, value: SessionEnvelope, expected: number) {
    assertLive(expected)
    generation++
    csrf = value.csrfToken
    publish({
      status: 'authenticated',
      tenant,
      session: Object.freeze({ ...value.session }),
      identity: Object.freeze({ ...value.identity }),
      host: null,
      security: null,
      navigation: 'idle',
      invalidated: false,
      logoutOutcome: 'idle',
    })
    expire()
  }
  function failure(error: unknown, expected: number) {
    if (expected !== generation || disposed) return
    const kind = port.classify(error)
    if (kind === 'unauthenticated') clear('anonymous', true)
    else if (kind === 'unavailable') clear('unavailable')
  }
  async function loadContext() {
    const { tenant } = credentials()
    const expected = generation
    publish({ host: null, navigation: 'loading' })
    try {
      const value = await port.context(tenant)
      assertLive(expected)
      if (
        value.tenantId !== tenant ||
        value.principalId !== state.identity?.principalId ||
        value.sessionId !== state.session?.id
      ) {
        clear('unavailable')
        throw new Error('Mismatched host context')
      }
      publish({
        host: Object.freeze({ ...value, navigation: Object.freeze({ ...value.navigation }) }),
        navigation: 'ready',
      })
    } catch (error) {
      if (expected === generation) {
        if (port.classify(error) === 'unauthenticated') failure(error, expected)
        else publish({ host: null, navigation: 'unavailable' })
      }
      throw error
    }
  }
  async function restore(tenant: string, selected: number) {
    if (disposed || selected !== selection) throw new Error('Operation abandoned')
    const known = state.status === 'authenticated' && state.tenant === tenant
    clear()
    publish({ tenant, status: 'checking', logoutOutcome: 'idle' })
    const expected = generation
    try {
      accept(tenant, await port.check(tenant), expected)
      if (state.status === 'authenticated') await loadContext()
    } catch (error) {
      if (expected === generation) {
        if (port.classify(error) === 'unauthenticated') {
          clear('anonymous', known)
          return
        }
        failure(error, expected)
        if (state.status === 'checking') clear()
      }
      throw error
    }
  }
  async function business<T>(
    work: (credentials: { tenant: string; csrf: string }) => Promise<T>,
  ): Promise<T> {
    const bound = scope(),
      boundPage = page,
      expected = generation
    if (!bound) throw new Error('Session required')
    while (pending) await pending
    assertLive(expected)
    if (scope() !== bound || page !== boundPage) throw new Error('Operation abandoned')
    let release!: () => void
    const lease = new Promise<void>((resolve) => {
      release = resolve
    })
    leases.add(lease)
    try {
      const result = await work(credentials())
      assertLive(expected)
      if (page !== boundPage) throw new Error('Stale response')
      return result
    } catch (error) {
      if (port.classify(error) === 'unauthenticated') failure(error, expected)
      throw error
    } finally {
      leases.delete(lease)
      release()
    }
  }
  function refresh() {
    if (rotation) return rotation
    if (departure) return departure
    const bound = scope(),
      boundPage = page
    rotation = serial(async () => {
      if (!bound || scope() !== bound || page !== boundPage) throw new Error('Operation abandoned')
      const { tenant, csrf: token } = credentials(),
        expected = generation
      try {
        accept(tenant, await port.refresh(tenant, token), expected)
        if (state.status === 'authenticated') await loadContext()
      } catch (error) {
        if (generation === expected) {
          clear('unavailable')
          failure(error, generation)
        }
        throw error
      }
    }).finally(() => {
      rotation = undefined
    })
    return rotation
  }
  function logout(all = false) {
    if (departure) return departure
    const bound = scope()
    if (!bound) return Promise.resolve()
    departure = serial(async () => {
      if (scope() !== bound) throw new Error('Operation abandoned')
      const { tenant, csrf: token } = credentials()
      clear()
      publish({ logoutOutcome: 'pending' })
      const expected = generation
      try {
        await port.logout(tenant, token, all)
        assertLive(expected)
        publish({ logoutOutcome: 'idle' })
      } catch (error) {
        if (generation === expected) publish({ logoutOutcome: 'unconfirmed' })
        throw error
      }
    }).finally(() => {
      departure = undefined
    })
    return departure
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    clear,
    business,
    refresh,
    logout,
    check(tenant: string) {
      const selected = selection
      return serial(() => restore(tenant, selected))
    },
    /** Tenant switches invalidate authority immediately, including queued and late work. */
    switchTenant(tenant: string) {
      const selected = ++selection
      page++
      clear()
      publish({ tenant })
      return serial(() => restore(tenant, selected))
    },
    login(tenant: string, login: string, password: string) {
      const boundPage = page,
        selected = selection
      return serial(async () => {
        if (page !== boundPage || selected !== selection || disposed)
          throw new Error('Operation abandoned')
        const previous = state.tenant === tenant ? csrf : undefined
        clear()
        publish({ tenant, status: 'checking', logoutOutcome: 'idle' })
        const expected = generation
        try {
          accept(tenant, await port.login(tenant, login, password, previous), expected)
          if (state.status === 'authenticated') await loadContext()
        } catch (error) {
          if (generation === expected) {
            clear(port.classify(error) === 'unavailable' ? 'unavailable' : 'anonymous')
          }
          throw error
        }
      })
    },
    reauthenticate(password: string) {
      const bound = scope(),
        boundPage = page
      return serial(async () => {
        if (!bound || scope() !== bound || boundPage !== page)
          throw new Error('Operation abandoned')
        const { tenant, csrf: token } = credentials(),
          expected = generation
        try {
          accept(tenant, await port.reauthenticate(tenant, token, password), expected)
          if (state.status === 'authenticated') await loadContext()
        } catch (error) {
          failure(error, expected)
          throw error
        }
      })
    },
    loadContext: () => serial(loadContext),
    async loadSecurity() {
      if (!options.oidcEnabled) return
      const value = await business(({ tenant }) => port.security(tenant))
      if (value.sessionId !== state.session?.id) throw new Error('Mismatched security snapshot')
      publish({ security: Object.freeze(value) })
    },
    providers(tenant: string) {
      if (!options.oidcEnabled) return Promise.resolve([])
      return port.providers(tenant)
    },
    beginSso(tenant: string, provider: string) {
      if (!options.oidcEnabled) return Promise.reject(new Error('OIDC disabled'))
      const selected = selection,
        boundPage = page
      return serial(async () => {
        if (disposed || selected !== selection || boundPage !== page)
          throw new Error('Operation abandoned')
        const expected = generation
        const value = await port.beginSso(
          tenant,
          provider,
          state.tenant === tenant ? csrf : undefined,
        )
        assertLive(expected)
        if (boundPage !== page) throw new Error('Operation abandoned')
        return value
      })
    },
    stepUp(provider: string, operation: StepUpOperation) {
      if (!options.oidcEnabled) return Promise.reject(new Error('OIDC disabled'))
      return business(({ tenant, csrf: token }) => port.stepUp(tenant, token, provider, operation))
    },
    activity() {
      return state.session && state.session.idleExpiresAt * 1000 - now() < 120_000
        ? refresh()
        : Promise.resolve()
    },
    leavePage() {
      page++
      publish({ security: null })
    },
    suspend() {
      page++
      clear()
      publish({ status: 'checking' })
    },
    dispose() {
      disposed = true
      page++
      clear()
      listeners.clear()
    },
  }
}
export type SessionOwner = ReturnType<typeof createSession>
