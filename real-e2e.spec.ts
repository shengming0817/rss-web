import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  authorsTenantHeader,
  boundedTimeout,
  classifyPlaywrightReport,
  finalizeOutcome,
  isCleanWebStatus,
} from './e2e/real/lifecycle.mjs'
import { executeBounded } from './e2e/real/process.mjs'

const root = resolve(import.meta.dirname)

describe('real RSS journey harness', () => {
  it('pins archived sources and assigns the exact browser phases to one reviewed artifact mode', () => {
    const output = execFileSync('node', ['e2e/real/run.mjs', '--print-plan'], {
      cwd: root,
      encoding: 'utf8',
    })
    const productionPhases = [
      'main',
      'password-change',
      'account-status-self',
      'roles',
      'policies-write',
      'settings-config',
      'rate-limited',
      'budget-exhausted',
      'admin-down',
      'primary-down',
    ]
    const phases = [...productionPhases, 'preview-isolation']

    expect(JSON.parse(output)).toEqual({
      sourceMode: 'git-archive',
      webSourceMode: 'git-archive-clean-head',
      pinnedRevision: 'b7f3e1d0bcc5b2e59639a81b4f37937914b53f00',
      tenantBootstrap: 'edge-deployment-fixed',
      browserNetwork: 'edge-only',
      faultTransport: 'none',
      phases,
      artifactModes: {
        production: productionPhases,
        'demo-preview': ['preview-isolation'],
      },
      previewArtifactSource: 'archived-clean-web-head',
      receiptPhaseEvidence: 'artifactMode',
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
    expect(runner).not.toContain('spawnSync')
    expect(runner).toContain('activeChild?.terminate()')
    expect(runner).toContain('await chromium.launch({ headless: true })')
    expect(runner).toContain('await waitServerListening(8080)')
    expect(runner).toContain('await boundedSleep(500)')
    const policyGrant = runner.slice(
      runner.indexOf("'rss-web-real-policies-list-read'"),
      runner.indexOf("'rss-web-real-policies-get-read'"),
    )
    expect(policyGrant).toContain('"effect":"allow"')
    expect(policyGrant).not.toContain('"obligations"')
    expect(defaultPlaywright).toContain("testIgnore: 'real/**'")
  })

  it('keeps one real runner and one Playwright failure classifier', () => {
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    expect(packageJson.scripts?.['test:e2e:real']).toBe('node e2e/real/run.mjs')

    const classifierOwners = readdirSync(resolve(root, 'e2e/real'), { recursive: true })
      .filter((entry) => /\.(?:mjs|ts)$/.test(entry))
      .filter((entry) => {
        const source = readFileSync(resolve(root, 'e2e/real', entry), 'utf8')
        return /\bfunction\s+classifyPlaywrightReport\s*\(/.test(source)
      })
    expect(classifierOwners).toEqual(['lifecycle.mjs'])
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
    expect(
      classifyPlaywrightReport({
        stats: { unexpected: 1 },
        suites: [
          {
            specs: [
              {
                file: 'e2e/real/journey.spec.ts',
                tests: [{ status: 'unexpected', results: [{ status: 'failed' }] }],
              },
            ],
          },
        ],
      }),
    ).toBe('product')
    expect(
      classifyPlaywrightReport({
        stats: { unexpected: 1 },
        suites: [
          {
            specs: [
              {
                file: 'e2e/real/journey.spec.ts',
                tests: [
                  {
                    status: 'unexpected',
                    results: [
                      {
                        status: 'failed',
                        error: { message: 'page.goto: net::ERR_CONNECTION_REFUSED' },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toBe('environment')
  })

  it('escalates a process tree that ignores SIGTERM and settles within the hard timeout', async () => {
    const startedAt = Date.now()
    const result = await executeBounded(
      process.execPath,
      [resolve(root, 'e2e/real/ignore-term.mjs')],
      { timeoutMs: 100, graceMs: 100, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    expect(result).toMatchObject({ signal: 'SIGKILL', timedOut: true })
    expect(Date.now() - startedAt).toBeLessThan(2_000)
  })
})
