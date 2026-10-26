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
  type HostLogin,
} from '@rss/auth'
import type { HttpTransport } from '@rss/api/identity'
import { createMdmTransport } from '@rss/api/mdm'
import { bindSession } from '@rss/auth'
import { createWorkspaceClient } from './services/workspace'
import { mdmKey, type MdmRuntime } from './context'
import { mdmI18n } from './i18n'
import { features } from './features'
import { createDeviceClients } from './features/devices/client'
import { createPolicyClients } from './features/policies/client'
import { createSoftwareClients } from './features/software/client'
import { createSecurityClients } from './features/security/client'
import { createOperationsClients } from './features/operations/client'
import { createOnboardingClients } from './features/enrollment/client'
import App from './App.vue'
import { createDeviceVuetify } from './ui/vuetify'
import { createRegistrationChannelsClient } from './services/registrationChannels'
import { createRegistrationChannels } from './services/registrationChannelState'
import { settingsFeature } from './features/settings/routes'
import { createSettingsClients } from './features/settings/client'
import { operationsFeature } from './features/operations/routes'
import type { decodeMdmConfig } from './services/workspace'
export function createMdm(
  transport: HttpTransport,
  config: HostConfig,
  host: ReturnType<typeof decodeMdmConfig>,
) {
  const platform =
    window.location.pathname === '/platform' ||
    window.location.pathname.startsWith('/platform/') ||
    window.location.pathname.startsWith(`/tenants/${host.managementTenant}/`)
  const login: HostLogin = {
    path: platform ? '/platform/login' : '/login',
    tenant: platform ? host.managementTenant : host.tenant,
    brand: 'RSS MDM',
    descriptionKey: platform ? 'settings.loginPlatform' : 'settings.loginTenant',
    origin: host.canonicalOrigin,
    switchHref: platform ? '/login' : '/platform',
    switchLabelKey: platform ? 'settings.businessLogin' : 'settings.platformLogin',
  }
  const realm = platform ? 'platform' : 'tenant'
  const tenant = platform ? host.managementTenant : host.tenant
  const session = createSession(transport, platform ? { ...config, oidcEnabled: false } : config)
  const publicTransport = createMdmTransport()
  const business = bindSession(publicTransport, session)
  const router = identityRouter(
    session,
    [
      ...(platform
        ? [
            {
              path: '/platform',
              name: 'mdm-entry',
              component: () => import('./views/EntryView.vue'),
              meta: { protected: true },
            },
          ]
        : []),
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
            {
              path: '/',
              name: 'mdm-entry',
              component: () => import('./views/EntryView.vue'),
              meta: { protected: true },
            },
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
      ...(settingsFeature.routes ?? []).filter(
        (route) => !platform || route.name !== 'settings-guide',
      ),
    ],
    login,
  )
  const settings = createSettingsClients(
    business,
    publicTransport,
    session,
    tenant,
    realm,
    host.serviceId,
  )
  const operations = createOperationsClients(business, tenant, realm)
  const registrationChannels = createRegistrationChannels(
    createRegistrationChannelsClient(business, tenant),
    session,
    operations.authorization,
    tenant,
    realm === 'tenant',
  )
  const app = createApp(App)
  app.onUnmount(() => {
    settings.operations.dispose()
    registrationChannels.dispose()
  })
  app.provide(runtimeKey, {
    session,
    hostLogin: login,
    landingTarget: () => ({ name: 'mdm-entry', query: router.currentRoute.value.query }),
    api: createApi(session),
    flows: createFlows(window.sessionStorage),
  })
  const mdm: MdmRuntime = {
    session,
    registrationChannels,
    transport: business,
    onboarding: createOnboardingClients(business, publicTransport, tenant, host.serviceId),
    workspace: createWorkspaceClient(business, false),
    devices: createDeviceClients(business, tenant),
    policies: createPolicyClients(business),
    software: createSoftwareClients(business),
    security: createSecurityClients(business, tenant),
    operations,
    settings,
    realm,
    serviceId: host.serviceId,
    businessTenant: host.tenant,
    managementTenant: host.managementTenant,
    tenant,
  }
  app.provide(mdmKey, mdm)
  const i18n = mdmI18n()
  return {
    app,
    session,
    router,
    i18n,
    mdm,
    transport: business,
    mount() {
      app.use(createPinia()).use(i18n).use(router).use(createDeviceVuetify()).mount('#app')
    },
  }
}
