import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { isRssApiError, type HttpTransport } from '@rss/api/identity'
import { createIdentityAdministration, type createFlows, type SessionOwner } from '@rss/auth-core'
import { createIdentityAdministrationAdapter, type HostConfig } from '@rss/auth-http'
import { useT } from './i18n'

export interface IdentityRuntime {
  owner: SessionOwner
  transport: HttpTransport
  config: HostConfig
  flows: ReturnType<typeof createFlows>
}
const Context = createContext<IdentityRuntime | null>(null)
export function Runtime({ value, children }: { value: IdentityRuntime; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useIdentity() {
  const runtime = useContext(Context)
  if (!runtime) throw new Error('Identity composition required')
  const snapshot = useSyncExternalStore(runtime.owner.subscribe, runtime.owner.getSnapshot)
  return { ...runtime, snapshot }
}
export function useAdministration() {
  const { transport, owner, config } = useIdentity()
  const [administration] = useState(() =>
    createIdentityAdministration(
      createIdentityAdministrationAdapter(transport, owner, config.oidcEnabled),
    ),
  )
  return administration
}
export function tenantLocator(value: unknown): string | null {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value) &&
    value !== '00000000-0000-0000-0000-000000000000'
    ? value
    : null
}
export function loginPath(tenant: string) {
  return `/tenants/${tenant}/login`
}
export function sessionPath(tenant: string) {
  return `/tenants/${tenant}/sessions`
}
export function identityScope(owner: SessionOwner) {
  const state = owner.getSnapshot()
  return state.status === 'authenticated'
    ? `${state.tenant}/${state.identity?.principalId}/${state.session?.id}`
    : ''
}
export function failureCode(failure: unknown) {
  return isRssApiError(failure) && failure.cause === 'wire' ? failure.code : 'unknown_result'
}
export function unresolved(code: string) {
  return ['unknown_result', 'configuration_changed', 'identity_unavailable'].includes(code)
}
/** A component lease discards late UI work. Authority/HTTP ordering stays with the sole owner. */
export function useOperation() {
  const active = useRef(true)
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const t = useT()
  useEffect(
    () => () => {
      active.current = false
    },
    [],
  )
  const checkpoint = () => {
    if (!active.current) throw new Error('Page departed')
  }
  async function run<T>(work: (checkpoint: () => void) => Promise<T>): Promise<T | undefined> {
    if (lock.current || !active.current) return undefined
    lock.current = true
    setBusy(true)
    setCode('')
    setRetryAt(null)
    try {
      return await work(checkpoint)
    } catch (failure) {
      if (active.current) {
        setCode(failureCode(failure))
        if (
          isRssApiError(failure) &&
          failure.code === 'rate_limited' &&
          failure.retryAfterSeconds !== undefined
        )
          setRetryAt(Date.now() + failure.retryAfterSeconds * 1000)
      }
      return undefined
    } finally {
      lock.current = false
      if (active.current) setBusy(false)
    }
  }
  return {
    busy,
    code,
    setCode,
    run,
    checkpoint,
    error: code
      ? t(`errors.${code}`, { time: retryAt === null ? '' : new Date(retryAt).toLocaleString() })
      : '',
  }
}
/** Secrets remain local; hidden documents and page departure discard them synchronously. */
export function useSecretCleanup(clear: () => void) {
  const latest = useRef(clear)
  latest.current = clear
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState !== 'visible') latest.current()
    }
    const departed = () => latest.current()
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('pagehide', departed)
    return () => {
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pagehide', departed)
      latest.current()
    }
  }, [])
}
