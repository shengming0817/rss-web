import { createHttpTransport } from '@rss/api'
import { createServerAuthorizationPort } from '@rss/authorization'
import {
  createAccountStatusApi,
  createIdentitySession,
  createPoliciesApi,
  createRolesApi,
} from '@rss/identity'
import { createAuditApi } from '@rss/audit'
import { createRuntimeApi } from '@rss/runtime'
import { createSettingsApi } from '@rss/settings'
import { createWebHistory, type RouterHistory } from 'vue-router'
import { createAuthorizationExperience } from './features/authorization/authorization-context'
import { isRoleBindingsPreviewEnabled } from './features/identity/role-bindings-preview-enablement'
import { createConfigPreviewDraftHandoff } from './features/settings/config-preview-draft-context'
import { isConfigCatalogPreviewEnabled } from './features/settings/config-catalog-preview'
import { isConfigHistoryPreviewEnabled } from './features/settings/config-history-preview'
import { createAppRouter } from './router'

export const DEFAULT_HTTP_TIMEOUT_MS = 10_000

export function createWebRuntime(history?: RouterHistory) {
  const transport = createHttpTransport({ baseURL: '', defaultTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS })
  const session = createIdentitySession({ transport })
  const accountStatus = createAccountStatusApi(session.transport)
  const roles = createRolesApi(session.transport)
  const policies = createPoliciesApi(session.transport)
  const audit = createAuditApi(session.transport)
  const runtime = createRuntimeApi(session.transport)
  const settings = createSettingsApi(session.transport)
  const port = createServerAuthorizationPort()
  const authorization = createAuthorizationExperience({ port, session })
  const roleBindingsPreview =
    import.meta.env.MODE !== 'production' &&
    isRoleBindingsPreviewEnabled(import.meta.env.MODE, import.meta.env.VITE_ROLE_BINDINGS_PREVIEW)
  const configCatalogPreview =
    import.meta.env.MODE !== 'production' &&
    isConfigCatalogPreviewEnabled(import.meta.env.MODE, import.meta.env.VITE_CONFIG_CATALOG_PREVIEW)
  const configHistoryPreview =
    import.meta.env.MODE !== 'production' &&
    isConfigHistoryPreviewEnabled(import.meta.env.MODE, import.meta.env.VITE_CONFIG_HISTORY_PREVIEW)
  const configPreviewDraft =
    configCatalogPreview || configHistoryPreview ? createConfigPreviewDraftHandoff() : undefined
  const router = createAppRouter(
    session,
    authorization,
    history ?? createWebHistory(import.meta.env.BASE_URL),
    configPreviewDraft !== undefined
      ? {
          configCatalogPreview,
          configHistoryPreview,
          configPreviewDraft,
          roleBindingsPreview,
        }
      : { configCatalogPreview: false, configHistoryPreview: false, roleBindingsPreview },
  )
  return Object.freeze({
    accountStatus,
    audit,
    authorization,
    policies,
    roles,
    router,
    runtime,
    settings,
    session,
  })
}
