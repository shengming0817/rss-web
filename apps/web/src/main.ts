import 'ant-design-vue/dist/reset.css'
import '@gocell/core/styles/tokens.css'
import '@gocell/core/styles/v1-linear.scss'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { createGocellI18n, PDP_INJECTION_KEY } from '@gocell/core'
import { createPdpClient, createHttpDecide } from '@gocell/access'
import { configureAxios, bootstrapSession } from './bootstrap'
import { registerGuards } from './router/guards'
import { useUiStore } from './stores/useUiStore'

const app = createApp(App)

// 1. Pinia first — authStore depends on it
app.use(createPinia())

// 2. Axios: auth callbacks wired to authStore
configureAxios(router)

// 3. i18n + router
app.use(createGocellI18n())
app.use(router)

// 4. PDP client provided for Can / useDecision in the whole app.
//    Assembly layer injects the real decision source (POST /api/v1/access/decide);
//    createPdpClient keeps the cache / TTL / single-flight / fail-closed wrapper.
const pdpClient = createPdpClient({ decide: createHttpDecide() })
app.provide(PDP_INJECTION_KEY, pdpClient)

// 5. Route guards (three-stage: first-run → auth → PDP). PDP deny → push the
//    reasonCode into useUiStore; AppShellLayout localises it (useI18n) and
//    announces it in an aria-live region. Keeps the guard free of i18n/UI.
registerGuards(router, app, pdpClient, (reasonCode: string) => {
  useUiStore().notifyAccessDenied(reasonCode)
})

// 6. Silent session restore via the httpOnly refresh cookie before the first
//    navigation, then mount. Awaiting before mount keeps the cold-start renewal
//    ahead of the first guard, so a reload never flashes /login (#12 H2 / #27).
void bootstrapSession().finally(() => app.mount('#app'))
