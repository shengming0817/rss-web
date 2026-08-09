import 'ant-design-vue/dist/reset.css'
import '@rss/core/styles/tokens.css'
import '@rss/core/styles/v1-linear.scss'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRssI18n } from '@rss/core'
import App from './App.vue'
import { router } from './router'
import { registerRouterA11y } from './router/guards'

const app = createApp(App)
app.use(createPinia())
app.use(createRssI18n())
app.use(router)
registerRouterA11y(router)
app.mount('#app')
