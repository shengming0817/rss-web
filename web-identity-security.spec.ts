import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = import.meta.dirname
const webSource = resolve(root, 'apps/web/src')

function sources(directory = webSource): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.(?:ts|vue)$/.test(entry.name) && !entry.name.endsWith('.spec.ts') ? [path] : []
  })
}

function productionText(): string {
  return sources()
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')
}

describe('web Identity composition boundary', () => {
  it('has one same-origin transport and one session composition root', () => {
    const text = productionText()
    expect(text.match(/createHttpTransport\(/g)).toHaveLength(1)
    expect(text.match(/createIdentitySession\(/g)).toHaveLength(1)
    expect(readFileSync(resolve(webSource, 'bootstrap.ts'), 'utf8')).toContain("baseURL: ''")
  })

  it('does not add tenant, persistence, JWT, low-level session or logging behavior', () => {
    const text = sources(resolve(webSource, 'features/identity'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n')
    expect(text).not.toMatch(
      /localStorage|sessionStorage|indexedDB|persist|jwt-decode|atob\(|X-Tenant-ID|@rss\/api\/session|console\.|logger\.|analytics/,
    )
    expect(text).not.toContain('name="tenant"')
  })

  it('keeps password mutation behind the injected session owner', () => {
    const text = sources(resolve(webSource, 'features/identity'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n')
    expect(text).not.toMatch(/createIdentityApi|session\.transport|@rss\/api\/endpoints\/identity/)
    expect(
      readFileSync(resolve(webSource, 'features/identity/PasswordChangeForm.vue'), 'utf8'),
    ).toContain('session.changePassword')
  })
})
