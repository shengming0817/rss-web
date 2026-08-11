import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const REVISION = /^[0-9a-f]{40}$/

function checkoutRevision(): string | undefined {
  try {
    return execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return undefined
  }
}

export function resolveWebBuildRevision(
  explicit: string | undefined,
  discover: () => string | undefined,
  mode: string,
): string {
  if (explicit !== undefined) {
    if (!REVISION.test(explicit)) {
      throw new Error('RSS_WEB_REVISION must be a lowercase 40-character Git SHA')
    }
    return explicit
  }
  const discovered = discover()
  if (discovered !== undefined) {
    if (!REVISION.test(discovered)) {
      throw new Error('Discovered Web build revision is not a lowercase 40-character Git SHA')
    }
    return discovered
  }
  if (mode !== 'production') return 'development'
  throw new Error('Web build revision is required for a production build')
}

export default defineConfig(({ mode }) => {
  const revision = resolveWebBuildRevision(process.env['RSS_WEB_REVISION'], checkoutRevision, mode)
  return {
    plugins: [vue()],
    define: { __RSS_WEB_REVISION__: JSON.stringify(revision) },
  }
})
