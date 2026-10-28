import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { vuetifyStyles } from '../../build/vuetify-styles.mjs'
export default defineConfig({
  plugins: [vuetifyStyles('.preview'), vue()],
  server: { host: '127.0.0.1' },
  build: { sourcemap: false },
})
