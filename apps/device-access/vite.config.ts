import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { vuetifyStyles } from '../../build/vuetify-styles.mjs'
import { accessThemes } from './themes'
import { demoPlugin } from './demo/plugin'
export default defineConfig(({ mode, command }) => {
  if (mode === 'demo' && command !== 'serve') throw new Error('Demo is serve-only')
  return {
    plugins: [
      vuetifyStyles('.access-surface', accessThemes),
      vue(),
      ...(mode === 'demo' ? [demoPlugin()] : []),
    ],
    build: { sourcemap: false },
    server: { host: '127.0.0.1' },
  }
})
