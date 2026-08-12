import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { auditRssReleaseBaseline } from './scripts/check-rss-release-baseline.mjs'
import baseline from './docs/contracts/20260812-rss-release-baseline.json'
import { auditEndpoints } from './packages/api/src/endpoints/audit'
import { identityEndpoints } from './packages/api/src/endpoints/identity'
import { runtimeEndpoints } from './packages/api/src/endpoints/runtime'
import { settingsEndpoints } from './packages/api/src/endpoints/settings'
import { createWebReleaseMeta } from './apps/web/src/release-meta'

const kebab = (value: string) => value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

const selectedEndpoints = Object.freeze(
  Object.entries({
    audit: auditEndpoints,
    identity: identityEndpoints,
    runtime: runtimeEndpoints,
    settings: settingsEndpoints,
  }).flatMap(([domain, endpoints]) =>
    Object.entries(endpoints).map(([name, endpoint]) => ({
      id: `${domain}.${kebab(name)}`,
      method: endpoint.method,
      path: endpoint.path,
      successStatus: endpoint.successStatus,
    })),
  ),
)

function changed(mutator: (copy: Record<string, unknown>) => void): unknown {
  const copy = structuredClone(baseline) as unknown as Record<string, unknown>
  mutator(copy)
  return copy
}

function resignContractClosures(copy: Record<string, unknown>): void {
  const hashes = new Map(
    (copy.files as { path: string; sha256: string }[]).map((file) => [file.path, file.sha256]),
  )
  for (const contract of copy.contracts as Record<string, unknown>[]) {
    contract.sourceClosureSha256 = createHash('sha256')
      .update(
        (contract.sourceFiles as string[]).map((path) => `${path}\0${hashes.get(path)}\n`).join(''),
      )
      .digest('hex')
  }
}

describe('RSS release baseline audit', () => {
  it('accepts the exact 25 selected typed endpoints and 80-file immutable closure', () => {
    expect(auditRssReleaseBaseline(baseline, selectedEndpoints)).toEqual({
      contracts: 25,
      files: 80,
      compatibleAdopted: 1,
      compatibleExact: 24,
    })
  })

  it('joins the About release scalars to the sole ledger identity', () => {
    const release = createWebReleaseMeta({
      webRevision: '0'.repeat(40),
      roleBindingsPreview: false,
      configCatalogPreview: false,
      configHistoryPreview: false,
    })
    expect(release.rssContractLedger).toMatchObject({
      id: baseline.id,
      sourceRevision: baseline.reviewedRssRevision,
    })
  })

  it.each([
    ['malformed', () => null],
    ['missing top-level field', () => changed((copy) => delete copy.files)],
    ['extra top-level field', () => changed((copy) => (copy.extra = true))],
    [
      'reviewed revision drift',
      () => changed((copy) => (copy.reviewedRssRevision = '0'.repeat(40))),
    ],
    [
      'historical comparison drift',
      () => changed((copy) => (copy.historicalComparisonRevision = '0'.repeat(40))),
    ],
    [
      'missing contract field',
      () =>
        changed((copy) => {
          delete (copy.contracts as Record<string, unknown>[])[0]!.method
        }),
    ],
    [
      'extra file field',
      () =>
        changed((copy) => {
          ;(copy.files as Record<string, unknown>[])[0]!.source = 'rss'
        }),
    ],
    [
      'duplicate contract',
      () =>
        changed((copy) => {
          const contracts = copy.contracts as unknown[]
          contracts[1] = contracts[0]
        }),
    ],
    [
      'duplicate source file',
      () =>
        changed((copy) => {
          const files = copy.files as unknown[]
          files[1] = files[0]
        }),
    ],
    [
      'coordinate drift',
      () =>
        changed((copy) => {
          const contract = (copy.contracts as Record<string, unknown>[])[0]!
          contract.path = '/api/v1/drift'
        }),
    ],
    [
      'contract source association swap',
      () =>
        changed((copy) => {
          const contracts = copy.contracts as Record<string, unknown>[]
          const first = contracts[0]!
          const second = contracts[1]!
          ;[first.sourceFiles, second.sourceFiles] = [second.sourceFiles, first.sourceFiles]
          ;[first.contractSource, second.contractSource] = [
            second.contractSource,
            first.contractSource,
          ]
          ;[first.sourceClosureSha256, second.sourceClosureSha256] = [
            second.sourceClosureSha256,
            first.sourceClosureSha256,
          ]
        }),
    ],
    [
      'shared transitive source ownership drift',
      () =>
        changed((copy) => {
          const contracts = copy.contracts as Record<string, unknown>[]
          const shared = 'contracts/components/identity/v1/common-abac-operator.schema.json'
          for (const contract of contracts) {
            const sources = contract.sourceFiles as string[]
            if (sources.includes(shared))
              contract.sourceFiles = sources.filter((path) => path !== shared)
          }
          const login = contracts.find((contract) => contract.id === 'identity.login')!
          login.sourceFiles = [...(login.sourceFiles as string[]), shared].sort()
          resignContractClosures(copy)
        }),
    ],
    [
      'hash drift',
      () =>
        changed((copy) => {
          const file = (copy.files as Record<string, unknown>[])[0]!
          file.sha256 = '0'.repeat(64)
        }),
    ],
    [
      'non-compatible decision',
      () =>
        changed((copy) => {
          const contract = (copy.contracts as Record<string, unknown>[])[0]!
          contract.decision = 'fail-closed'
        }),
    ],
  ])('fails closed for %s', (_name, fixture) => {
    expect(() => auditRssReleaseBaseline(fixture(), selectedEndpoints)).toThrow()
  })

  it('fails closed when a selected endpoint is missing or added', () => {
    expect(() => auditRssReleaseBaseline(baseline, selectedEndpoints.slice(1))).toThrow()
    expect(() =>
      auditRssReleaseBaseline(baseline, [
        ...selectedEndpoints,
        { id: 'future.contract', method: 'GET', path: '/api/v1/future', successStatus: 200 },
      ]),
    ).toThrow()
  })
})
