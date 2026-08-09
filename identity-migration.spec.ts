import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname)
const legacyWord = ['go', 'cell'].join('')
const provenance = `docs/migration/20260809-001-${legacyWord}-web-source-baseline.md`
const provenanceSha256 = 'dc46a3ee9246f9dc5dc88185da0ce6c305e88eaacf8e2576a1c8d3284f025880'
const legacyIdentity = new RegExp(`@${legacyWord}/|${legacyWord}|go[ _-]cell`, 'i')
const provenanceLink = `[\`${provenance}\`](${provenance})`

function trackedFiles(): string[] {
  return execFileSync('/usr/bin/git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
}

function readTrackedContent(path: string, worktreeRoot = root): Buffer {
  try {
    return readFileSync(resolve(worktreeRoot, path))
  } catch {
    return execFileSync('/usr/bin/git', ['show', `:${path}`], { cwd: root })
  }
}

describe('RSS-only product identity', () => {
  it('pins the sole historical provenance exception', () => {
    const digest = createHash('sha256')
      .update(readFileSync(resolve(root, provenance)))
      .digest('hex')
    expect(digest).toBe(provenanceSha256)
  })

  it('contains no legacy identity outside the exact provenance exceptions', () => {
    const violations = trackedFiles().flatMap((path) => {
      if (path !== provenance && legacyIdentity.test(path)) return [`${path}:filename`]
      if (path === provenance) return []

      let text = readTrackedContent(path).toString('latin1')
      if (path === 'README.md') {
        const parts = text.split(provenanceLink)
        if (parts.length !== 2) return [`${path}:provenance-link`]
        text = parts.join('')
      }
      return legacyIdentity.test(text) ? [`${path}:content`] : []
    })
    expect(violations).toEqual([])
  })

  it('falls back to the index when tracked worktree content is unavailable', () => {
    const absentWorktree = mkdtempSync(resolve(tmpdir(), 'rss-web-absent-worktree-'))
    try {
      expect(readTrackedContent('package.json', absentWorktree)).toEqual(
        execFileSync('/usr/bin/git', ['show', ':package.json'], { cwd: root }),
      )
    } finally {
      rmSync(absentWorktree, { recursive: true })
    }
  })

  it('uses one closed workspace namespace', () => {
    const packageFiles = [
      'package.json',
      'apps/web/package.json',
      'packages/api/package.json',
      'packages/core/package.json',
      'packages/identity/package.json',
      'packages/shared/package.json',
    ]
    const names = packageFiles.map(
      (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8')).name,
    )
    expect(names).toEqual([
      'rss-web',
      '@rss/web',
      '@rss/api',
      '@rss/core',
      '@rss/identity',
      '@rss/shared',
    ])
  })

  it('rejects legacy identity embedded in binary build output', () => {
    const fixture = mkdtempSync(resolve(tmpdir(), 'rss-web-identity-'))
    try {
      writeFileSync(resolve(fixture, 'asset.bin'), Buffer.from([0, ...Buffer.from(legacyWord)]))
      expect(() =>
        execFileSync(process.execPath, ['scripts/check-built-identity.mjs', fixture], {
          cwd: root,
          stdio: 'pipe',
        }),
      ).toThrow()
    } finally {
      rmSync(fixture, { recursive: true })
    }
  })
})
