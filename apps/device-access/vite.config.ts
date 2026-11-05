import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { antdStyles } from '../../build/antd-styles'
import { demoPlugin } from './demo/plugin'
export default defineConfig(({ mode, command }) => {
  if (mode === 'demo' && command !== 'serve') throw new Error('Demo is serve-only')
  return {
    plugins: [antdStyles(), react(), ...(mode === 'demo' ? [demoPlugin()] : [])],
    build: { sourcemap: false, target: 'esnext' },
    server: { host: '127.0.0.1' },
  }
})
