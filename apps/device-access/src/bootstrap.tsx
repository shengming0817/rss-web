import { useEffect, useMemo, useSyncExternalStore, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Presentation } from '@rss/core'
import { createSession, type AuthenticationFlows } from '@rss/auth-core'
import { createAuthPort, bindSession, type HostConfig } from '@rss/auth-http'
import type { HttpTransport } from '@rss/api/identity'
import { createDeviceAccessTransport } from '@rss/api/device-access'
import {
  createLiveClient,
  createSecurityClient,
  type DeviceAccessClient,
  type SecurityClient,
} from '@rss/device-access/client'
import { DaContext, identityKey, type WriteState } from './context'
import { App } from './App'
import '@rss/core/styles/tokens.css'
import 'virtual:rss-theme.css'
import './ui/styles.css'
export interface DemoComposition {
  source: 'demo'
  controls: ComponentType
  clients: (owner: ReturnType<typeof createSession>) => {
    client: DeviceAccessClient
    security: SecurityClient
  }
}
export function createDeviceAccess(
  identity: HttpTransport,
  config: HostConfig,
  tenant: string,
  flows: AuthenticationFlows,
  demo?: DemoComposition,
) {
  const session = createSession(createAuthPort(identity), { oidcEnabled: config.oidcEnabled }),
    writes = new Map<string, WriteState>()
  const base = demo ? '/' : `/tenants/${tenant}`
  let previous: string | null = null
  const unsubscribe = session.subscribe(() => {
    const next = identityKey(session)
    if (next !== previous) {
      writes.clear()
      previous = next
    }
  })
  function Composition() {
    const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot)
    const scope = snapshot.tenant === tenant ? identityKey(session) : null
    const runtime = useMemo(() => {
      if (!scope) return null
      const clients = demo?.clients(session)
      return {
        session,
        tenant,
        source: demo ? ('demo' as const) : ('service' as const),
        controls: demo?.controls ?? null,
        writes,
        flows,
        client:
          clients?.client ??
          createLiveClient(bindSession(createDeviceAccessTransport(), session), tenant),
        security: clients?.security ?? createSecurityClient(bindSession(identity, session), tenant),
      }
    }, [scope])
    useEffect(
      () => () => {
        void runtime?.security.cancel().catch(() => undefined)
      },
      [runtime],
    )
    return (
      <Presentation>
        <BrowserRouter basename={base}>
          <DaContext.Provider value={runtime}>
            <App
              session={session}
              flows={flows}
              tenant={tenant}
              oidc={config.oidcEnabled}
              controls={demo?.controls ?? null}
              {...(snapshot.status === 'authenticated' ? {} : { status: snapshot.status })}
            />
          </DaContext.Provider>
        </BrowserRouter>
      </Presentation>
    )
  }
  return {
    session,
    mount: async (resume?: 'sso' | 'step-up') => {
      if (resume) {
        await session.check(tenant).catch(() => undefined)
        const state = session.getSnapshot()
        if (state.status !== 'authenticated' || state.tenant !== tenant) {
          unsubscribe()
          session.dispose()
          throw new Error('Session not confirmed')
        }
        window.history.replaceState(null, '', resume === 'sso' ? base : base + '/security')
      }
      const root = createRoot(document.getElementById('app')!)
      root.render(<Composition />)
      if (!resume) void session.check(tenant).catch(() => undefined)
      return () => {
        root.unmount()
        unsubscribe()
        session.dispose()
      }
    },
  }
}
