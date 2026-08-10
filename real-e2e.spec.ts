import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname)

describe('real RSS journey harness', () => {
  it('pins an archived RSS source and keeps every browser phase behind the Web Edge', () => {
    const output = execFileSync('node', ['e2e/real/run.mjs', '--print-plan'], {
      cwd: root,
      encoding: 'utf8',
    })
    expect(JSON.parse(output)).toEqual({
      sourceMode: 'git-archive',
      pinnedRevision: 'b7f3e1d0bcc5b2e59639a81b4f37937914b53f00',
      tenantBootstrap: 'edge-deployment-fixed',
      browserNetwork: 'edge-only',
      phases: ['main', 'budget-exhausted', 'admin-down', 'primary-down'],
      malformedResponseEvidence: 'isolated-playwright-smoke',
      cleanup: 'compose-down-volumes-and-temporary-snapshot',
    })
  })

  it('does not use browser interception, direct tenant headers, or a sibling working tree', () => {
    const journey = readFileSync(resolve(root, 'e2e/real/journey.spec.ts'), 'utf8')
    const runner = readFileSync(resolve(root, 'e2e/real/run.mjs'), 'utf8')
    const defaultPlaywright = readFileSync(resolve(root, 'playwright.config.ts'), 'utf8')
    expect(journey).not.toContain('page.route')
    expect(journey).not.toContain('X-Tenant-ID')
    expect(runner).toContain("['archive', '--output', archivePath, revision]")
    expect(runner).toContain("'down', '--volumes', '--remove-orphans'")
    expect(defaultPlaywright).toContain("testIgnore: 'real/**'")
  })
})
