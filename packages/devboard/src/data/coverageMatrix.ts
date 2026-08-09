/**
 * Coverage matrix — STATIC, hand-maintained meta data.
 *
 * This page is gocell-web's own implementation-progress board: which design
 * routes have shipped as real Vue views vs which remain design-only. It does
 * NOT describe backend cells (orthogonal to CELL_MANIFEST) and is curated by
 * hand against the router — the legitimate truth source is the design file
 * `dev-coverage.jsx` (PRD §514). `route`/`web`/`design` are code & route
 * literals (not translated); the capability name + status are i18n keys.
 */

export type CoverageStatus = 'matched' | 'partial' | 'design-only' | 'backend-only' | 'out-of-scope'

export interface CoverageRow {
  /** Route path literal, e.g. '/login'. */
  readonly route: string
  /** i18n key for the capability name. */
  readonly capabilityKey: string
  /** Shipped Vue implementation ref (import subpath), or null if not built. */
  readonly web: string | null
  /** Design source ref (jsx file), or null if no design. */
  readonly design: string | null
  readonly status: CoverageStatus
}

export interface CoverageSection {
  /** i18n key for the section heading. */
  readonly titleKey: string
  readonly rows: readonly CoverageRow[]
}

export const COVERAGE_MATRIX: readonly CoverageSection[] = [
  {
    titleKey: 'coverage.section.auth',
    rows: [
      {
        route: '/login',
        capabilityKey: 'coverage.cap.login',
        web: '@gocell/access/views/login',
        design: 'v1-linear.jsx',
        status: 'matched',
      },
      {
        route: '/first-run-setup',
        capabilityKey: 'coverage.cap.firstRun',
        web: '@gocell/access/views/first-run',
        design: 'first-run-setup.jsx',
        status: 'matched',
      },
    ],
  },
  {
    titleKey: 'coverage.section.meta',
    rows: [
      {
        route: '/coverage',
        capabilityKey: 'coverage.cap.coverage',
        web: '@gocell/devboard/views/coverage',
        design: 'dev-coverage.jsx',
        status: 'matched',
      },
      {
        route: '/',
        capabilityKey: 'coverage.cap.home',
        web: 'apps/web/views/HomeView.vue',
        design: 'dev-observe.jsx',
        status: 'partial',
      },
    ],
  },
  {
    titleKey: 'coverage.section.access',
    rows: [
      {
        route: '/access/identities',
        capabilityKey: 'coverage.cap.identities',
        web: '@gocell/access/views/identities',
        design: 'dev-pages.jsx',
        status: 'matched',
      },
      {
        route: '/access/policies',
        capabilityKey: 'coverage.cap.policies',
        web: '@gocell/access/views/policies',
        design: 'dev-pages.jsx',
        status: 'matched',
      },
      {
        route: '/access/decisions',
        capabilityKey: 'coverage.cap.decisions',
        web: null,
        design: 'dev-extras.jsx',
        status: 'design-only',
      },
    ],
  },
  {
    titleKey: 'coverage.section.operate',
    rows: [
      {
        route: '/audit',
        capabilityKey: 'coverage.cap.audit',
        web: '@gocell/audit/views/audit',
        design: 'dev-audit.jsx',
        status: 'matched',
      },
      {
        route: '/config',
        capabilityKey: 'coverage.cap.config',
        web: '@gocell/config/views/config',
        design: 'dev-pages.jsx',
        status: 'matched',
      },
      {
        route: '/flags',
        capabilityKey: 'coverage.cap.flags',
        web: '@gocell/config/views/flags',
        design: 'dev-pages.jsx',
        status: 'matched',
      },
      {
        route: '/cells',
        capabilityKey: 'coverage.cap.cells',
        web: '@gocell/devboard/views/cells-list',
        design: 'dev-cell.jsx',
        status: 'matched',
      },
      {
        route: '/cells/:id',
        capabilityKey: 'coverage.cap.cellDetail',
        web: '@gocell/devboard/views/cell-detail',
        design: 'dev-cell.jsx',
        status: 'matched',
      },
      {
        route: '/groups',
        capabilityKey: 'coverage.cap.groups',
        web: '@gocell/devboard/views/groups',
        design: 'dev-cell.jsx',
        status: 'partial',
      },
    ],
  },
  {
    titleKey: 'coverage.section.build',
    rows: [
      {
        route: '/contracts',
        capabilityKey: 'coverage.cap.contracts',
        web: '@gocell/devboard/views/contracts',
        design: 'dev-extras3.jsx',
        status: 'matched',
      },
      {
        route: '/deps',
        capabilityKey: 'coverage.cap.deps',
        web: '@gocell/devboard/views/deps',
        design: 'dev-extras3.jsx',
        status: 'partial',
      },
      {
        route: '/workflow',
        capabilityKey: 'coverage.cap.workflow',
        web: null,
        design: 'dev-develop.jsx',
        status: 'design-only',
      },
      {
        route: '/ai',
        capabilityKey: 'coverage.cap.ai',
        web: null,
        design: 'dev-wave4.jsx',
        status: 'design-only',
      },
    ],
  },
  {
    titleKey: 'coverage.section.observe',
    rows: [
      {
        route: '/observe',
        capabilityKey: 'coverage.cap.observe',
        web: null,
        design: 'dev-observe.jsx',
        status: 'backend-only',
      },
    ],
  },
]

export type CoverageCounts = Readonly<Record<CoverageStatus, number>> & { readonly total: number }

const STATUSES: readonly CoverageStatus[] = [
  'matched',
  'partial',
  'design-only',
  'backend-only',
  'out-of-scope',
]

/** Tally rows by status across all sections. */
export function coverageCounts(
  matrix: readonly CoverageSection[] = COVERAGE_MATRIX,
): CoverageCounts {
  const counts: Record<CoverageStatus, number> = {
    matched: 0,
    partial: 0,
    'design-only': 0,
    'backend-only': 0,
    'out-of-scope': 0,
  }
  let total = 0
  for (const section of matrix) {
    for (const row of section.rows) {
      counts[row.status] += 1
      total += 1
    }
  }
  return { ...counts, total }
}

export { STATUSES as COVERAGE_STATUSES }
