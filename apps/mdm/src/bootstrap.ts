import '@rss/core/styles/tokens.css'
import '@rss/auth/styles.css'
import './style.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  createSession,
  createApi,
  createFlows,
  identityRouter,
  runtimeKey,
  type HostConfig,
} from '@rss/auth'
import type { HttpTransport } from '@rss/api/identity'
import { createMdmTransport } from '@rss/api/mdm'
import { bindSession } from './services/request'
import { createWorkspaceClient } from './services/workspace'
import { mdmKey } from './context'
import { mdmI18n } from './i18n'
import { features } from './features'
import { createDeviceClients } from './features/devices/client'
import { createPolicyClients } from './features/policies/client'
import { createSoftwareClients } from './features/software/client'
import { createSecurityClients } from './features/security/client'
import { createOperationsClients } from './features/operations/client'
import App from './App.vue'
export function startMdm(
  transport: HttpTransport,
  config: HostConfig,
  tenant: string,
  demo: boolean,
) {
  const session = createSession(transport, config)
  const business = bindSession(createMdmTransport(), session)
  const router = identityRouter(
    session,
    [
      { path: '/', redirect: { name: 'workspace', params: { tenant } } },
      {
        path: '/tenants/:tenant/workspace',
        name: 'workspace',
        component: () => import('./views/WorkspaceView.vue'),
        meta: { protected: true },
      },
      ...Object.values(features).flatMap((f) => [f.entry, ...(f.routes ?? [])]),
    ],
    tenant,
  )
  const app = createApp(App)
  app.provide(runtimeKey, {
    session,
    landingRoute: 'workspace',
    api: createApi(session),
    flows: createFlows(window.sessionStorage),
  })
  app.provide(mdmKey, {
    session,
    transport: business,
    workspace: createWorkspaceClient(business, demo),
    devices: createDeviceClients(business, tenant, demo),
    policies: createPolicyClients(business, tenant, demo),
    software: createSoftwareClients(business, tenant, demo),
    security: createSecurityClients(business, tenant, demo),
    operations: createOperationsClients(business, tenant, demo),
    tenant,
    demo,
  })
  const i18n = mdmI18n()
  app.use(createPinia()).use(i18n).use(router).mount('#app')
  return { app, session, router, i18n, transport: business }
}
