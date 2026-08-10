import { createHttpTransport } from '@rss/api'
import { createServerAuthorizationPort } from '@rss/authorization'
import { createAccountStatusApi, createIdentitySession, createRolesApi } from '@rss/identity'
import { createAuditApi } from '@rss/audit'
import { createRuntimeApi } from '@rss/runtime'
import { createWebHistory, type RouterHistory } from 'vue-router'
import { createAuthorizationExperience } from './features/authorization/authorization-context'
import { createAppRouter } from './router'

export const DEFAULT_HTTP_TIMEOUT_MS = 10_000

export function createWebRuntime(history?: RouterHistory) {
  const transport = createHttpTransport({ baseURL: '', defaultTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS })
  const session = createIdentitySession({ transport })
  const accountStatus = createAccountStatusApi(session.transport)
  const roles = createRolesApi(session.transport)
  const audit = createAuditApi(session.transport)
  const runtime = createRuntimeApi(session.transport)
  const port = createServerAuthorizationPort()
  const authorization = createAuthorizationExperience({ port, session })
  const router = createAppRouter(
    session,
    authorization,
    history ?? createWebHistory(import.meta.env.BASE_URL),
  )
  return Object.freeze({ accountStatus, audit, authorization, roles, router, runtime, session })
}
