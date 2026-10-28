import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRssI18n } from '@rss/core'
import '@rss/core/styles/tokens.css'
import App from './App.vue'
import { createPreviewVuetify } from './vuetify'
import 'virtual:vuetify-styles.css'
import './style.css'
createApp(App).use(createPreviewVuetify()).use(createPinia()).use(createRssI18n()).mount('#app')
