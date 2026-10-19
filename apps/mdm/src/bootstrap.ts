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
import { createOnboardingClients } from './features/enrollment/client'
import App from './App.vue'
import { settingsFeature } from './features/settings/routes'
import { createSettingsClients } from './features/settings/client'
import { operationsFeature } from './features/operations/routes'
import type { decodeMdmConfig } from './services/workspace'
export function startMdm(
  transport: HttpTransport,
  config: HostConfig,
  host: ReturnType<typeof decodeMdmConfig>,
  demo: boolean,
) {
  const platform =
    window.location.pathname === '/platform' ||
    window.location.pathname.startsWith(`/tenants/${host.managementTenant}/`)
  const realm = platform ? 'platform' : 'tenant'
  const tenant = platform ? host.managementTenant : host.tenant
  const session = createSession(transport, platform ? { ...config, oidcEnabled: false } : config)
  const publicTransport = createMdmTransport()
  const business = bindSession(publicTransport, session)
  const router = identityRouter(
    session,
    [
      {
        path: '/platform',
        redirect: { name: 'settings-overview', params: { tenant: host.managementTenant } },
      },
      ...(platform
        ? []
        : [
            {
              path: '/enrollment/windows/entra/terms',
              name: 'entra-terms',
              component: () => import('./features/enrollment/views/TermsView.vue'),
            },
            {
              path: '/downloads/agent',
              name: 'agent-downloads',
              component: () => import('./features/enrollment/views/DownloadsView.vue'),
            },
            { path: '/', redirect: { name: 'workspace', params: { tenant } } },
            {
              path: '/tenants/:tenant/workspace',
              name: 'workspace',
              component: () => import('./views/WorkspaceView.vue'),
              meta: { protected: true },
            },
            ...Object.values(features).flatMap((f) => [f.entry, ...(f.routes ?? [])]),
          ]),
      ...(platform
        ? [
            {
              path: '/tenants/:tenant/workspace',
              name: 'workspace',
              redirect: { name: 'settings-overview', params: { tenant } },
            },
            ...[...(operationsFeature.routes ?? [])].filter(
              (route) => route.name === 'operations-authorization',
            ),
          ]
        : []),
      settingsFeature.entry,
      ...(settingsFeature.routes ?? []),
    ],
    tenant,
  )
  const settings = createSettingsClients(business, publicTransport, session, tenant, realm)
  const app = createApp(App)
  app.onUnmount(() => settings.operations.dispose())
  app.provide(runtimeKey, {
    session,
    landingRoute: 'workspace',
    api: createApi(session),
    flows: createFlows(window.sessionStorage),
  })
  app.provide(mdmKey, {
    session,
    transport: business,
    onboarding: createOnboardingClients(business, publicTransport, tenant),
    workspace: createWorkspaceClient(business, demo),
    devices: createDeviceClients(business, tenant, demo),
    policies: createPolicyClients(business, tenant, demo),
    software: createSoftwareClients(business),
    security: createSecurityClients(business, tenant, demo),
    operations: createOperationsClients(business, tenant, demo, realm),
    settings,
    realm,
    businessTenant: host.tenant,
    managementTenant: host.managementTenant,
    tenant,
    demo,
  })
  const i18n = mdmI18n()
  app.use(createPinia()).use(i18n).use(router).mount('#app')
  return { app, session, router, i18n, transport: business }
}
