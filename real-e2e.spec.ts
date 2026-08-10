import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  authorsTenantHeader,
  boundedTimeout,
  classifyPlaywrightReport,
  finalizeOutcome,
  isCleanWebStatus,
} from './e2e/real/lifecycle.mjs'

const root = resolve(import.meta.dirname)

describe('real RSS journey harness', () => {
  it('pins an archived RSS source and keeps every browser phase behind the Web Edge', () => {
    const output = execFileSync('node', ['e2e/real/run.mjs', '--print-plan'], {
      cwd: root,
      encoding: 'utf8',
    })
    expect(JSON.parse(output)).toEqual({
      sourceMode: 'git-archive',
      webSourceMode: 'git-archive-clean-head',
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
    expect(authorsTenantHeader(journey)).toBe(false)
    expect(authorsTenantHeader(`headers: { 'X-Tenant-ID': 'forged' }`)).toBe(true)
    expect(authorsTenantHeader(`headers: { 'x-tenant-id': 'forged' }`)).toBe(true)
    expect(authorsTenantHeader(`headers.set('x-tenant-id', 'forged')`)).toBe(true)
    expect(runner).toContain("['archive', '--output', archivePath, revision]")
    expect(runner).toContain("['archive', '--output', webArchivePath, webRevision]")
    expect(runner).toContain("'down', '--volumes', '--remove-orphans'")
    expect(defaultPlaywright).toContain("testIgnore: 'real/**'")
  })

  it('fails closed for cleanup, total deadlines, and non-assertion Playwright failures', () => {
    expect(isCleanWebStatus('')).toBe(true)
    expect(isCleanWebStatus(' M apps/web/src/main.ts\n')).toBe(false)
    expect(isCleanWebStatus('?? untracked.ts\n')).toBe(false)
    expect(
      finalizeOutcome(
        { status: 'passed' },
        { status: 'failed', project: 'fixture', recoveryPath: '/tmp/fixture' },
      ),
    ).toMatchObject({
      status: 'failed',
      failure: { stage: 'environment:cleanup', classification: 'environment' },
    })
    expect(boundedTimeout(1_100, 500, 1_000)).toBe(100)
    expect(boundedTimeout(999, 500, 1_000)).toBe(0)
    expect(classifyPlaywrightReport({ stats: { unexpected: 0 } })).toBe('passed')
    expect(
      classifyPlaywrightReport({
        stats: { unexpected: 1 },
        suites: [
          { specs: [{ tests: [{ results: [{ error: { location: { file: '/tool.js' } } }] }] }] },
        ],
      }),
    ).toBe('environment')
    expect(
      classifyPlaywrightReport({
        stats: { unexpected: 1 },
        suites: [
          {
            specs: [
              {
                tests: [
                  {
                    results: [{ error: { location: { file: '/repo/e2e/real/journey.spec.ts' } } }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toBe('product')
  })
})
