import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig(({ mode }) => {
  const revision =
    process.env['RSS_IDENTITY_WEB_REVISION'] ?? (mode === 'production' ? '' : 'development')
  if (mode === 'production' && !/^[0-9a-f]{40}$/.test(revision))
    throw new Error('RSS_IDENTITY_WEB_REVISION must identify the build source')
  return {
    plugins: [
      vue(),
      {
        name: 'identity-source',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'identity-build.json',
            source: JSON.stringify({ revision }),
          })
        },
      },
    ],
    define: { __IDENTITY_REVISION__: JSON.stringify(revision) },
    build: { sourcemap: false },
  }
})
