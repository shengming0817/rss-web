import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { antdStyles } from '../../build/antd-styles'
export default defineConfig({
  plugins: [react(), antdStyles()],
  build: { sourcemap: false },
  server: { host: '127.0.0.1' },
})
