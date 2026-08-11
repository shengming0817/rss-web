import 'ant-design-vue/dist/reset.css'
import '@rss/core/styles/tokens.css'
import '@rss/core/styles/v1-linear.scss'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createWebI18n } from './i18n'
import App from './App.vue'
import { createWebRuntime } from './bootstrap'
import { authorizationExperiencePlugin } from './features/authorization/authorization-context'
import { identitySessionPlugin } from './features/identity/session-context'
import { accountStatusApiPlugin } from './features/identity/account-status-context'
import { rolesApiPlugin } from './features/identity/roles-context'
import { policiesApiPlugin } from './features/identity/policies-context'
import { auditApiPlugin } from './features/audit/audit-context'
import { runtimeApiPlugin } from './features/runtime/runtime-context'

const app = createApp(App)
const { accountStatus, audit, authorization, policies, roles, router, runtime, session } =
  createWebRuntime()
app.use(createPinia())
app.use(createWebI18n())
app.use(router)
app.use(identitySessionPlugin(session))
app.use(accountStatusApiPlugin(accountStatus))
app.use(rolesApiPlugin(roles))
app.use(policiesApiPlugin(policies))
app.use(authorizationExperiencePlugin(authorization))
app.use(auditApiPlugin(audit))
app.use(runtimeApiPlugin(runtime))
app.mount('#app')
