import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname)
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('Settings config security boundary', () => {
  it('keeps publish non-replayable and 204 decoder-free', () => {
    const client = read('packages/settings/src/config/client.ts')
    expect(client).toContain("session: 'required-no-replay'")
    expect(client).toContain("session: 'required'")
    expect(client).not.toContain('headers:')
    expect(client).not.toMatch(/retry|fallback|X-Tenant-ID/)
  })

  it('keeps sensitive values out of persistence and diagnostics owners', () => {
    const owners = execFileSync(
      '/usr/bin/git',
      [
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '--',
        'apps/web/src/features/settings',
        'packages/settings/src',
      ],
      { cwd: root, encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(Boolean)
      .filter((path) => !path.endsWith('.spec.ts') && !path.endsWith('.typecheck.ts'))
    expect(owners).toContain('apps/web/src/features/settings/ConfigView.vue')
    expect(owners).toContain('packages/settings/src/config/client.ts')
    const production = owners.map(read).join('\n')
    expect(production).not.toMatch(
      /localStorage|sessionStorage|indexedDB|console\.|logger\.|analytics/,
    )
    expect(production).not.toMatch(/query:|headers:|location\.|route\.query/)
  })
})
