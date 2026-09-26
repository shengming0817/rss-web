import '@rss/core/styles/tokens.css'
import '@rss/auth/styles.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createIdentityTransport } from '@rss/api/identity'
import {
  loadConfig,
  createSession,
  createApi,
  createFlows,
  identityRouter,
  runtimeKey,
  identityI18n,
  AuthShell,
} from '@rss/auth'
async function start() {
  const transport = createIdentityTransport()
  const config = await loadConfig(transport, window.location.origin)
  const session = createSession(transport, config)
  const app = createApp(AuthShell)
  app.provide(runtimeKey, {
    session,
    api: createApi(session),
    flows: createFlows(window.sessionStorage),
  })
  app.use(createPinia()).use(identityI18n()).use(identityRouter(session)).mount('#app')
}
void start().catch(() => {
  const root = document.getElementById('app')
  if (root) root.textContent = 'Identity configuration unavailable / 身份应用配置不可用'
})
