import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRssI18n } from '@rss/core'
import '@rss/core/styles/tokens.css'
import App from './App.vue'
import './style.css'
createApp(App).use(createPinia()).use(createRssI18n()).mount('#app')
