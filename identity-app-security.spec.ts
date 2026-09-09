import { readdirSync, readFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
const root = import.meta.dirname
function sources(dir = resolve(root, 'apps/identity/src')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sources(resolve(dir, e.name))
      : /\.(ts|vue)$/.test(e.name) && !e.name.endsWith('.spec.ts')
        ? [resolve(dir, e.name)]
        : [],
  )
}
describe('separate central Identity application', () => {
  it('has no legacy authentication, persistence of credentials, or network bypass', () => {
    for (const path of sources()) {
      const s = readFileSync(path, 'utf8')
      expect(s, relative(root, path)).not.toMatch(
        /@rss\/identity(?:['"/])|Authorization|X-Tenant-ID|accessToken|refreshToken|localStorage|indexedDB|console\.|\batob\(|jwt-decode/,
      )
      if (!path.endsWith('/main.ts')) expect(s).not.toContain('sessionStorage')
      if (!path.endsWith('/services/flow.ts')) expect(s).not.toMatch(/\.setItem\(/)
    }
  })
  it('enforces app import and network boundaries', async () => {
    const lint = new ESLint({ cwd: root })
    for (const text of [
      "import { createIdentitySession } from '@rss/identity'",
      "import axios from 'axios'",
      "fetch('/api/private')",
      "import { createIdentityApi } from '../../../../../packages/identity/src/api'",
    ]) {
      const result = await lint.lintText(text, {
        filePath: resolve(root, 'apps/identity/src/services/session.ts'),
      })
      expect(result[0]?.messages.some((m) => m.ruleId?.startsWith('no-restricted'))).toBe(true)
    }
  })
})
