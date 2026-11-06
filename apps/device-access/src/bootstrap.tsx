import { useEffect, useMemo, useSyncExternalStore, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Presentation } from '@rss/core'
import { createSession, createFlows } from '@rss/auth-core'
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
import type { DaHost } from './config'
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
  host: DaHost,
  demo?: DemoComposition,
) {
  if (config.canonicalOrigin !== host.canonicalOrigin) throw new Error('Mismatched hosts')
  const session = createSession(createAuthPort(identity), { oidcEnabled: config.oidcEnabled }),
    flows = createFlows(sessionStorage),
    writes = new Map<string, WriteState>()
  let previous: string | null = null
  const unsubscribe = session.subscribe(() => {
    const next = identityKey(session)
    if (next && next !== previous) {
      writes.clear()
      previous = next
    }
  })
  function Composition() {
    const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot)
    const scope = identityKey(session)
    const runtime = useMemo(() => {
      if (!scope) return null
      const clients = demo?.clients(session)
      return {
        session,
        host,
        source: demo ? ('demo' as const) : ('service' as const),
        controls: demo?.controls ?? null,
        writes,
        flows,
        client:
          clients?.client ?? createLiveClient(bindSession(createDeviceAccessTransport(), session)),
        security:
          clients?.security ?? createSecurityClient(bindSession(identity, session), host.tenant),
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
        <BrowserRouter>
          <DaContext.Provider value={runtime}>
            <App
              session={session}
              flows={flows}
              host={host}
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
    mount: () => {
      const root = createRoot(document.getElementById('app')!)
      root.render(<Composition />)
      if (window.location.pathname !== '/auth/resume')
        void session.check(host.tenant).catch(() => undefined)
      return () => {
        root.unmount()
        unsubscribe()
        session.dispose()
      }
    },
  }
}
