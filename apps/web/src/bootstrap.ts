import { createHttpTransport } from '@rss/api'
import { createServerAuthorizationPort } from '@rss/authorization'
import { createIdentitySession } from '@rss/identity'
import { createWebHistory, type RouterHistory } from 'vue-router'
import { createAuthorizationExperience } from './features/authorization/authorization-context'
import { createAppRouter } from './router'

export const DEFAULT_HTTP_TIMEOUT_MS = 10_000

export function createWebRuntime(history?: RouterHistory) {
  const transport = createHttpTransport({ baseURL: '', defaultTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS })
  const session = createIdentitySession({ transport })
  const port = createServerAuthorizationPort()
  const authorization = createAuthorizationExperience({ port, session })
  const router = createAppRouter(
    session,
    authorization,
    history ?? createWebHistory(import.meta.env.BASE_URL),
  )
  return Object.freeze({ authorization, router, session })
}
