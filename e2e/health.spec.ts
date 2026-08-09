import { test, expect } from '@playwright/test'
import { loginAs, stubSetupDone } from './helpers'

/**
 * Batch 7 health-overview + observe smoke tests.
 *
 * Covers:
 *   1. Health overview degraded: endpoints 404 → degraded banner visible, no blank/error page.
 *   2. Health overview OK: endpoints return minimal payload → summary section visible.
 *   3. Observe smoke: tablist renders; switching to Logs tab works.
 *   4. Protected redirect: unauthenticated '/' → redirected to /login.
 *
 * Backend is stubbed via page.route() (no real accesscore / observability backend needed).
 * Auth is established via loginAs() (token is in-memory Pinia state — see e2e/helpers.ts).
 * loginAs() lands on the target route via the post-login redirect, never a second
 * page.goto: a reload would wipe the in-memory token and bounce back to /login.
 *
 * Payload shape note: fetchCellHealth/fetchSystemInfo return the response body
 * directly (HealthCellsResponse / SystemInfoResponse) — BR-001/002 are specified
 * envelope-less, so stubs must NOT wrap data in a `{ data: ... }` envelope.
 */

const HEALTH_CELLS_URL = '**/api/v1/admin/health/cells'
const SYSTEM_URL = '**/api/v1/admin/system'

// ─── Health overview — degraded ───────────────────────────────────────────────

test.describe('Health overview — degraded (BR-001/002 endpoints absent)', () => {
  test('renders degraded banner when health endpoints return 404', async ({ page }) => {
    await stubSetupDone(page)

    // Stub both health endpoints as 404 → store transitions to unavailable
    await page.route(HEALTH_CELLS_URL, (route) => route.fulfill({ status: 404 }))
    await page.route(SYSTEM_URL, (route) => route.fulfill({ status: 404 }))

    // Lands on '/' (LandingView) — the view polls the (404) health endpoints on mount.
    await loginAs(page)

    // Page must render (h1 visible) — not a blank/error screen
    await expect(page.locator('h1').first()).toBeVisible()

    // Degraded banner must appear
    await expect(page.locator('[data-testid="health-degraded"]')).toBeVisible()
  })
})

// ─── Health overview — OK ─────────────────────────────────────────────────────

test.describe('Health overview — OK (minimal payload)', () => {
  test('renders summary section when health endpoint returns one cell', async ({ page }) => {
    await stubSetupDone(page)

    // Valid health/cells payload: one healthy cell. Body is envelope-less and the
    // cell carries the full CellHealthEntry shape so the cell cards render.
    await page.route(HEALTH_CELLS_URL, (route) =>
      route.fulfill({
        json: {
          summary: {
            totalCells: 1,
            healthy: 1,
            degraded: 0,
            down: 0,
            lastCheckAt: new Date().toISOString(),
          },
          cells: [
            {
              name: 'accesscore',
              type: 'core',
              status: 'healthy',
              durability: 'Durable',
              version: '1.2.3',
              commit: 'a7f3c1d',
              startedAt: new Date().toISOString(),
              uptimeSeconds: 7200,
              lastHealthCheckAt: new Date().toISOString(),
              lastHealthCheckDurationMs: 12,
              sliceCount: 1,
              slices: [
                { name: 'auth', status: 'healthy', lastErrorAt: null, lastErrorMessage: null },
              ],
            },
          ],
        },
      }),
    )

    // System card degrades independently — 404 keeps the test focused on the
    // health summary path and avoids coupling to the SystemInfoResponse shape.
    await page.route(SYSTEM_URL, (route) => route.fulfill({ status: 404 }))

    // Lands on '/' (LandingView) — the view polls the (stubbed) health endpoints on mount.
    await loginAs(page)

    // h1 visible — page renders
    await expect(page.locator('h1').first()).toBeVisible()

    // Summary section heading is visible (the section rendered by isLoaded path)
    // The summary section is a <section> aria-labelledby landing-summary-heading
    await expect(page.locator('#landing-summary-heading')).toBeVisible()
  })
})

// ─── Observe smoke ────────────────────────────────────────────────────────────

test.describe('Observe view smoke', () => {
  test('tablist renders and switching to Logs tab works', async ({ page }) => {
    await stubSetupDone(page)

    // Observe view does not call health endpoints directly, but stub to be safe
    await page.route(HEALTH_CELLS_URL, (route) => route.fulfill({ status: 404 }))
    await page.route(SYSTEM_URL, (route) => route.fulfill({ status: 404 }))
    // Stub LGTM-related endpoints (Prometheus / Loki / Tempo — BR-003) as 404
    // so the panels degrade gracefully without blocking render.
    await page.route('**/api/v1/observability/**', (route) => route.fulfill({ status: 404 }))

    // Lands directly on '/observe' via the post-login redirect (no reload).
    await loginAs(page, { target: '/observe' })

    // h1 visible — page renders
    await expect(page.locator('h1').first()).toBeVisible()

    // Tab bar renders
    await expect(page.locator('[role="tablist"]')).toBeVisible()

    // Click the Logs tab (id: observe-tab-logs) and verify it becomes selected
    const logsTab = page.locator('[role="tab"]#observe-tab-logs')
    await expect(logsTab).toBeVisible()
    await logsTab.click()
    await expect(logsTab).toHaveAttribute('aria-selected', 'true')
  })
})

// ─── Protected redirect ───────────────────────────────────────────────────────

test.describe('Protected route redirect', () => {
  test('unauthenticated access to "/" redirects to /login', async ({ page }) => {
    await stubSetupDone(page)

    // No login — navigate directly to '/'
    await page.goto('/')

    // The auth guard must redirect to /login
    await expect(page).toHaveURL(/\/login(\?.*)?$/)
  })
})
