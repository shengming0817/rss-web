import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = import.meta.dirname
const sessionRoot = resolve(root, 'packages/identity/src/session')

function productionSources(directory = sessionRoot): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return productionSources(path)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : []
  })
}

function matchingLines(pattern: RegExp): string[] {
  return productionSources().flatMap((path) =>
    readFileSync(path, 'utf8')
      .split('\n')
      .flatMap((line, index) => (pattern.test(line) ? [`${path}:${index + 1}:${line}`] : [])),
  )
}

describe('memory-only session security boundary', () => {
  it('contains no persistence, JWT parsing, analytics or logging in session production code', () => {
    expect(
      matchingLines(
        /localStorage|sessionStorage|indexedDB|persist|jwt-decode|atob\(|console\.|logger\.|analytics/,
      ),
    ).toEqual([])
  })

  it('does not let Identity session code author tenant or Authorization headers', () => {
    expect(matchingLines(/Authorization|X-Tenant-ID/)).toEqual([])
  })
})
