import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// server.proxy /api → VITE_API_BASE：开发期直连真实后端，无 BFF（plan.md §Technical Context）。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBase = env.VITE_API_BASE || 'http://127.0.0.1:8080'

  return {
    plugins: [vue()],
    server: {
      proxy: {
        '/api': {
          target: apiBase,
          changeOrigin: true,
        },
      },
    },
  }
})
