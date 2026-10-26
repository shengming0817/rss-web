import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { deviceStyles } from './device-styles'
export default defineConfig(async ({ mode, command }) => {
  if (mode === 'demo' && command !== 'serve')
    throw new Error('Demo requires the local HTTP scenario server; use pnpm dev:mdm:demo')
  return {
    plugins: [
      deviceStyles(),
      vue(),
      ...(mode === 'demo' ? [(await import('./demo/plugin')).demoPlugin()] : []),
    ],
    build: { sourcemap: false },
    server: { host: '127.0.0.1' },
  }
})
