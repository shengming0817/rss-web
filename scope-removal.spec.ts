import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname)
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const tracked = (path: string) =>
  execFileSync('/usr/bin/git', ['ls-files', '--', path], { cwd: root, encoding: 'utf8' }).trim()

const removed = [
  'packages/access',
  'packages/config',
  'packages/contracts',
  'packages/devboard',
  'packages/observability',
  'tools/cell-manifest',
  'tools/codegen',
]

describe('RSS-only foundation boundary', () => {
  it.each(removed)('does not track removed product surface: %s', (path) => {
    expect(tracked(path)).toBe('')
  })

  it('ships the reusable foundation and selected identity adapter', () => {
    for (const name of ['api', 'audit', 'authorization', 'core', 'identity', 'runtime', 'shared']) {
      expect(existsSync(resolve(root, 'packages', name, 'package.json'))).toBe(true)
    }
  })

  it('keeps one API seam without contract copies or the retired request package', () => {
    expect(tracked('packages/request')).toBe('')
    for (const path of [
      'packages/api/contracts',
      'packages/api/schemas',
      'packages/api/codegen',
      'packages/api/registry',
      'packages/identity/contracts',
      'packages/identity/schemas',
      'packages/identity/codegen',
      'packages/identity/registry',
      'packages/audit/contracts',
      'packages/audit/schemas',
      'packages/audit/codegen',
      'packages/audit/registry',
      'packages/runtime/contracts',
      'packages/runtime/schemas',
      'packages/runtime/codegen',
      'packages/runtime/registry',
    ]) {
      expect(tracked(path)).toBe('')
    }
  })

  it('keeps Axios and production API paths behind @rss/api', () => {
    let output = ''
    try {
      output = execFileSync(
        '/usr/bin/git',
        ['grep', '-n', '-E', 'from [\'"]axios[\'"]|[\'"]/api/', '--', 'apps', 'packages'],
        { cwd: root, encoding: 'utf8' },
      )
    } catch (error) {
      const status = (error as { status?: number }).status
      if (status !== 1) throw error
    }
    const violations = output
      .split('\n')
      .filter(Boolean)
      .filter((line) => !line.includes('.spec.ts:'))
      .filter((line) => !line.includes('.typecheck.ts:'))
      .filter((line) => !line.startsWith('packages/api/src/transport.ts:'))
      .filter((line) => !line.startsWith('packages/api/src/endpoints/identity.ts:'))
      .filter((line) => !line.startsWith('packages/api/src/endpoints/audit.ts:'))
      .filter((line) => !line.startsWith('packages/api/src/endpoints/runtime.ts:'))
    expect(violations).toEqual([])
  })

  it('does not log Identity production data', () => {
    let output = ''
    try {
      output = execFileSync(
        '/usr/bin/git',
        ['grep', '-n', '-E', 'console\\.|logger\\.', '--', 'packages/identity/src'],
        { cwd: root, encoding: 'utf8' },
      )
    } catch (error) {
      const status = (error as { status?: number }).status
      if (status !== 1) throw error
    }
    const productionMatches = output
      .split('\n')
      .filter(Boolean)
      .filter((line) => !line.includes('.spec.ts:'))
    expect(productionMatches).toEqual([])
  })

  it('exposes only implemented Home and Runtime navigation with the protected catch-all', () => {
    const router = read('apps/web/src/router/index.ts')
    const runtimeIntent = read('apps/web/src/features/runtime/runtime-intent.ts')
    expect(router).toContain("path: '/'")
    expect(router).toContain("path: '/login'")
    expect(router).toContain("path: ':pathMatch(.*)*'")
    expect(
      [...router.matchAll(/labelKey: '(navigation\.[^']+)'/g)].map((match) => match[1]),
    ).toEqual(['navigation.home', 'navigation.runtime'])
    expect(router).toContain('authorizationIntent: RUNTIME_INVENTORY_INTENT')
    expect(runtimeIntent).toContain("contractId: 'runtime.inventory'")
    expect(runtimeIntent).toContain("permission: 'runtime:inventory:read'")
    for (const path of [
      '/access',
      '/config',
      '/flags',
      '/admin',
      '/observability',
      '/observe',
      '/audit',
    ]) {
      expect(router).not.toContain(path)
    }
  })

  it('has no production calls to historical backends', () => {
    let output = ''
    try {
      output = execFileSync(
        '/usr/bin/git',
        [
          'grep',
          '-n',
          '-E',
          '/api/v1/(access|config|admin|observability)|/internal/v1',
          '--',
          'apps',
          'packages',
        ],
        { cwd: root, encoding: 'utf8' },
      )
    } catch (error) {
      const status = (error as { status?: number }).status
      if (status !== 1) throw error
    }
    const productionMatches = output
      .split('\n')
      .filter(Boolean)
      .filter((line) => !line.includes('.spec.ts:'))
    expect(productionMatches).toEqual([])
  })

  it('does not retain historical authentication or PDP route contracts', () => {
    const forbidden = [
      '/api/v1/access/decide',
      'createPdpClient',
      'permissionMap',
      'requiresAuth',
      'requiredAction',
      'requiredResource',
      'PDP_INJECTION_KEY',
    ]
    for (const token of forbidden) {
      let output = ''
      try {
        output = execFileSync(
          '/usr/bin/git',
          ['grep', '-n', token, '--', 'apps/web/src', 'packages'],
          { cwd: root, encoding: 'utf8' },
        )
      } catch (error) {
        const status = (error as { status?: number }).status
        if (status !== 1) throw error
      }
      const productionMatches = output
        .split('\n')
        .filter(Boolean)
        .filter((line) => !line.includes('.spec.ts:'))
        .filter((line) => !line.includes('.typecheck.ts:'))
      expect(productionMatches).toEqual([])
    }

    expect(read('packages/core/vitest.config.ts')).not.toContain('src/pdp/')
  })

  it('does not retain obsolete workflows or package dependencies', () => {
    for (const workflow of [
      '.github/workflows/cell-manifest-diff.yml',
      '.github/workflows/codegen-diff.yml',
    ]) {
      expect(tracked(workflow)).toBe('')
    }
    const dependencies = JSON.parse(read('apps/web/package.json')).dependencies as Record<
      string,
      string
    >
    expect(
      Object.keys(dependencies).filter((name) =>
        removed.some((path) => name.endsWith(path.split('/').at(-1)!)),
      ),
    ).toEqual([])
  })

  it('keeps authoritative RSS source labels at reviewed production owners', () => {
    const output = execFileSync(
      '/usr/bin/git',
      ['grep', '-l', 'RSS_SOURCE', '--', 'apps/web/src', 'packages'],
      { cwd: root, encoding: 'utf8' },
    )
    const productionOwners = output
      .trim()
      .split('\n')
      .filter((path) => !path.endsWith('.spec.ts'))
      .filter((path) => !path.endsWith('.typecheck.ts'))
      .filter((path) => path !== 'packages/shared/src/index.ts')
      .sort()
    expect(productionOwners).toEqual([
      'apps/web/src/features/audit/HomeAuditEntries.vue',
      'apps/web/src/features/runtime/HomeRuntimeSummary.vue',
      'apps/web/src/features/runtime/RuntimeDetailsView.vue',
      'apps/web/src/router/index.ts',
    ])
  })
})
