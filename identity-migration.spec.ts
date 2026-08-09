import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname)
const provenance = 'docs/migration/20260809-001-gocell-web-source-baseline.md'
const self = 'identity-migration.spec.ts'
const legacyIdentity = /@gocell\/|gocell|go[ _-]cell/i

function trackedFiles(): string[] {
  return execFileSync('/usr/bin/git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
}

describe('RSS-only product identity', () => {
  it('contains no legacy identity outside the immutable provenance record', () => {
    const violations = trackedFiles().flatMap((path) => {
      if (path === provenance || path === self) return []
      const content = readFileSync(resolve(root, path))
      if (content.includes(0)) return []
      const text = content.toString('utf8').replaceAll(provenance, '')
      return legacyIdentity.test(path) || legacyIdentity.test(text) ? [path] : []
    })
    expect(violations).toEqual([])
  })

  it('uses one closed workspace namespace', () => {
    const packageFiles = [
      'package.json',
      'apps/web/package.json',
      'packages/core/package.json',
      'packages/request/package.json',
      'packages/shared/package.json',
    ]
    const names = packageFiles.map(
      (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8')).name,
    )
    expect(names).toEqual(['rss-web', '@rss/web', '@rss/core', '@rss/request', '@rss/shared'])
  })
})
