import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig(async ({ mode, command }) => {
  if (mode === 'demo' && command !== 'serve')
    throw new Error('Demo requires the local HTTP scenario server; use pnpm dev:mdm:demo')
  return {
    plugins: [vue(), ...(mode === 'demo' ? [(await import('./demo/plugin')).demoPlugin()] : [])],
    build: { sourcemap: false },
    server: { host: '127.0.0.1' },
  }
})
