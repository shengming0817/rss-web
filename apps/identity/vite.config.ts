import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { vuetifyStyles } from '../../build/vuetify-styles.mjs'

export default defineConfig({
  plugins: [vuetifyStyles('.auth-host'), vue()],
  build: { sourcemap: false },
})
