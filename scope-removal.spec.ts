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
  'packages/audit',
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

  it('ships only the reusable package foundation', () => {
    for (const name of ['core', 'request', 'shared']) {
      expect(existsSync(resolve(root, 'packages', name, 'package.json'))).toBe(true)
    }
  })

  it('exposes only the neutral home route', () => {
    const router = read('apps/web/src/router/index.ts')
    expect(router).toContain("path: '/'")
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
})
