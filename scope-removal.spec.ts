import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname)

const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const tracked = (path: string) =>
  execFileSync('/usr/bin/git', ['ls-files', '--', path], { cwd: root, encoding: 'utf8' }).trim()

describe('RSS Web scope boundary', () => {
  it.each([
    'packages/devboard',
    'tools/cell-manifest',
    'tools/codegen',
    '.github/workflows/cell-manifest-diff.yml',
    '.github/workflows/codegen-diff.yml',
  ])('does not ship removed product surface: %s', (path) => {
    expect(tracked(path)).toBe('')
    if (path.endsWith('.yml')) expect(existsSync(resolve(root, path))).toBe(false)
  })

  it('does not expose removed routes or navigation entries', () => {
    const router = read('apps/web/src/router/index.ts')
    const nav = read('packages/core/src/ui/navConfig.ts')
    const removedPaths = [
      '/first-run-setup',
      '/flags',
      '/observe',
      '/cells',
      '/contracts',
      '/deps',
      '/coverage',
      '/groups',
    ]

    for (const path of removedPaths) {
      expect(router).not.toContain(path)
      expect(nav).not.toContain(path)
    }
  })

  it('does not retain removed tooling or package dependencies', () => {
    const rootPackage = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>
    }
    const webPackage = JSON.parse(read('apps/web/package.json')) as {
      dependencies: Record<string, string>
    }

    expect(rootPackage.scripts).not.toHaveProperty('codegen')
    expect(rootPackage.scripts).not.toHaveProperty('cell-manifest')
    expect(webPackage.dependencies).not.toHaveProperty('@gocell/devboard')
  })

  it('does not export removed first-run, flag, or hosted-observe views', () => {
    expect(read('packages/access/package.json')).not.toContain('./views/first-run')
    expect(read('packages/config/package.json')).not.toContain('./views/flags')
    expect(read('packages/observability/package.json')).not.toContain('./views/observe')
  })
})
