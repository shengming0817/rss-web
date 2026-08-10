import 'ant-design-vue/dist/reset.css'
import '@rss/core/styles/tokens.css'
import '@rss/core/styles/v1-linear.scss'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createWebI18n } from './i18n'
import App from './App.vue'
import { createWebRuntime } from './bootstrap'
import { identitySessionPlugin } from './features/identity/session-context'

const app = createApp(App)
const { router, session } = createWebRuntime()
app.use(createPinia())
app.use(createWebI18n())
app.use(router)
app.use(identitySessionPlugin(session))
app.mount('#app')
