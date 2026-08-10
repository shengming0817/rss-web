import { createHttpTransport } from '@rss/api'
import { createIdentitySession } from '@rss/identity'
import { createWebHistory, type RouterHistory } from 'vue-router'
import { createAppRouter } from './router'

export const DEFAULT_HTTP_TIMEOUT_MS = 10_000

export function createWebRuntime(history?: RouterHistory) {
  const transport = createHttpTransport({ baseURL: '', defaultTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS })
  const session = createIdentitySession({ transport })
  const router = createAppRouter(session, history ?? createWebHistory(import.meta.env.BASE_URL))
  return Object.freeze({ router, session })
}
