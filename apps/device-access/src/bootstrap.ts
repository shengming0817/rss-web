import { createApp, watch, type Component } from 'vue'
import {
  createSession,
  createApi,
  createFlows,
  identityRouter,
  runtimeKey,
  identityI18n,
  bindSession,
  type HostConfig,
  type HostLogin,
} from '@rss/auth'
import type { HttpTransport } from '@rss/api/identity'
import { createDeviceAccessTransport } from '@rss/api/device-access'
import {
  createLiveClient,
  createSecurityClient,
  type DeviceAccessClient,
  type SecurityClient,
} from '@rss/device-access/client'
import { daKey, identityKey, type DaRuntime } from './context'
import type { DaHost } from './config'
import { featureRoutes } from './router'
import { createAccessVuetify } from './ui/vuetify'
import LoginView from './auth/LoginView.vue'
import ErrorView from './auth/ErrorView.vue'
import App from './App.vue'
import { zh } from './i18n/zh-CN'
import './ui/styles.css'
export interface DemoComposition {
  source: 'demo'
  controls: Component
  clients: (session: ReturnType<typeof createSession>) => {
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
  const session = createSession(identity, config),
    business = bindSession(createDeviceAccessTransport(), session)
  const injected = demo?.clients(session)
  const hostLogin: HostLogin = {
    path: '/login',
    tenant: host.tenant,
    brand: 'RSS Device Access',
    descriptionKey: 'identity.loginDescription',
    origin: host.canonicalOrigin,
    switchHref: '/login',
    switchLabelKey: 'identity.login',
  }
  const router = identityRouter(session, featureRoutes, hostLogin, {
    login: LoginView,
    error: ErrorView,
    includeManagement: false,
  })
  const runtime: DaRuntime = {
    session,
    host,
    source: demo ? 'demo' : 'service',
    controls: demo?.controls ?? null,
    client: injected?.client ?? createLiveClient(business),
    security:
      injected?.security ?? createSecurityClient(bindSession(identity, session), host.tenant),
    writes: new Map(),
  }
  watch(
    () => identityKey(session),
    () => {
      runtime.writes.clear()
      void runtime.security.cancel().catch(() => undefined)
    },
    { flush: 'sync' },
  )
  const i18n = identityI18n()
  i18n.global.mergeLocaleMessage('zh-CN', { da: zh })
  i18n.global.locale.value = 'zh-CN'
  const app = createApp(App)
    .use(i18n)
    .use(createAccessVuetify())
    .use(router)
    .provide(runtimeKey, {
      session,
      api: createApi(session),
      flows: createFlows(window.sessionStorage),
      hostLogin,
      landingTarget: () => ({ name: 'overview' }),
    })
    .provide(daKey, runtime)
  return { runtime, router, i18n, mount: () => app.mount('#app') }
}
