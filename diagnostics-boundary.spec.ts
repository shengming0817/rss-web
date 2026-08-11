import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname)
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const tracked = (path: string) =>
  execFileSync('/usr/bin/git', ['ls-files', '--', path], { cwd: root, encoding: 'utf8' }).trim()

describe('diagnostics and release metadata boundary', () => {
  it('does not create a diagnostics package, store, provider, or runtime registry', () => {
    for (const path of [
      'packages/diagnostics',
      'apps/web/src/diagnostics',
      'apps/web/src/stores/diagnostics.ts',
      'apps/web/src/providers',
      'apps/web/src/registry',
    ]) {
      expect(tracked(path)).toBe('')
    }
  })

  it('keeps degraded presentation pure and requires each caller to choose recovery', () => {
    const degraded = read('packages/core/src/components/DegradedState.vue')
    expect(degraded).toContain("export type DegradedRecovery = 'none' | 'retryRead'")
    expect(degraded).toContain('readonly recovery: DegradedRecovery')
    expect(degraded).not.toMatch(/@rss\/api|axios|IdentitySession|fetch\(|setTimeout|automatic/i)

    const candidates = execFileSync(
      '/usr/bin/git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'apps/web/src'],
      { cwd: root, encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(Boolean)
      .filter((path) => existsSync(resolve(root, path)))
      .filter((path) => path.endsWith('.vue'))
    const callers = candidates.filter((path) => read(path).includes('<DegradedState'))
    expect(callers.length).toBeGreaterThan(0)
    for (const path of callers) {
      for (const tag of read(path).matchAll(/<DegradedState\b[\s\S]*?\/>/g)) {
        expect(tag[0], `${path} must select a closed recovery policy`).toMatch(/\b:?recovery=/)
      }
    }
  })

  it('keeps release facts static, closed, and separate from runtime authority', () => {
    const release = read('apps/web/src/release-meta.ts')
    const about = read('apps/web/src/views/AboutView.vue')
    const bootstrap = read('apps/web/src/bootstrap.ts')
    expect(release).toContain("sourceRevision: 'b513d3390d73d4f291bb31afc588ca1307ce19af'")
    expect(release).toContain('source: EXTERNAL_SOURCE')
    expect(release).toContain('source: MOCK_SOURCE')
    expect(release).not.toMatch(
      /fetch\(|axios|transport|provider|listener|tenant|principal|permission/i,
    )
    expect(about).not.toMatch(/fetch\(|axios|transport|import\.meta\.env|provider|listener/i)
    expect(bootstrap).toContain('createCurrentWebReleaseMeta')
    expect(bootstrap).toContain('roleBindingsPreview')
    expect(bootstrap).toContain('configCatalogPreview')
    expect(bootstrap).toContain('configHistoryPreview')
  })

  it('keeps the Web revision distinct from the RSS real-harness revision', () => {
    const dockerfile = read('deploy/web/Dockerfile')
    const realRunner = read('e2e/real/run.mjs')
    expect(dockerfile).toContain('RSS_WEB_BUILD_REVISION')
    expect(dockerfile).toContain('RSS_WEB_REVISION')
    expect(realRunner).toContain('webRevision')
    expect(realRunner).toContain('rssRevision')
    expect(realRunner).not.toMatch(/RSS_WEB_BUILD_REVISION[^\n]*rssRevision/)
  })
})
