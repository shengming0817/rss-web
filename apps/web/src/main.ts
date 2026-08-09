import 'ant-design-vue/dist/reset.css'
import '@gocell/core/styles/tokens.css'
import '@gocell/core/styles/v1-linear.scss'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createGocellI18n } from '@gocell/core'
import App from './App.vue'
import { router } from './router'
import { registerRouterA11y } from './router/guards'

const app = createApp(App)
app.use(createPinia())
app.use(createGocellI18n())
app.use(router)
registerRouterA11y(router)
app.mount('#app')
