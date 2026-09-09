import '@rss/core/styles/tokens.css'
import '@rss/core/styles/v1-linear.scss'
import './style.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createIdentityTransport } from '@rss/api/identity'
import { createSession } from './services/session'
import { createApi } from './services/api'
import { createFlows } from './services/flow'
import { identityRouter } from './router'
import { runtimeKey } from './context'
import { identityI18n } from './i18n'
import App from './App.vue'
const session = createSession(createIdentityTransport())
const app = createApp(App)
app.provide(runtimeKey, {
  session,
  api: createApi(session),
  flows: createFlows(window.sessionStorage),
})
app.use(createPinia()).use(identityI18n()).use(identityRouter(session)).mount('#app')
