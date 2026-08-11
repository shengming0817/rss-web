import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const REVISION = /^[0-9a-f]{40}$/

export function resolveWebBuildRevision(explicit: string | undefined, mode: string): string {
  if (explicit !== undefined) {
    if (!REVISION.test(explicit)) {
      throw new Error('RSS_WEB_REVISION must be a lowercase 40-character Git SHA')
    }
    return explicit
  }
  if (mode !== 'production') return 'development'
  throw new Error('RSS_WEB_REVISION is required for a production build')
}

export default defineConfig(({ mode }) => {
  const revision = resolveWebBuildRevision(process.env['RSS_WEB_REVISION'], mode)
  return {
    plugins: [vue()],
    define: { __RSS_WEB_REVISION__: JSON.stringify(revision) },
  }
})
