import { expect, type Page } from '@playwright/test'

/**
 * Shared Playwright e2e helpers.
 *
 * Auth invariant: the access token lives ONLY in in-memory Pinia state — it is
 * never written to localStorage/sessionStorage (useAuthStore, security iron
 * rule §7.1). A full-page navigation (`page.goto`) therefore wipes the session,
 * and the auth guard bounces back to /login. Tests must establish auth and then
 * stay within SPA navigation; `loginAs()` lands on the protected target via the
 * post-login redirect rather than a second `page.goto`.
 */

const STATUS_URL = '**/api/v1/access/setup/status'
const LOGIN_URL = '**/api/v1/access/sessions/login'

/** Stub the first-run gate as "setup already done" so guards let protected routes through. */
export async function stubSetupDone(page: Page): Promise<void> {
  await page.route(STATUS_URL, (route) => route.fulfill({ json: { data: { hasAdmin: true } } }))
}

/**
 * Stub the Landing health/system polls as 404 (→ degraded). Any test that lands
 * on '/' authenticated mounts LandingView, which polls these endpoints on mount;
 * leaving them unstubbed lets the request reach the dev proxy, where a backend
 * 401 on the fake token triggers refresh → onAuthFail → a session-expired bounce
 * to /login. Stubbing at the browser level keeps '/' deterministic.
 */
export async function stubHealthEndpoints(page: Page): Promise<void> {
  await page.route('**/api/v1/admin/health/cells', (route) => route.fulfill({ status: 404 }))
  await page.route('**/api/v1/admin/system', (route) => route.fulfill({ status: 404 }))
}

export interface LoginOptions {
  /** Protected route to land on after login (default '/'). */
  target?: string
  username?: string
  password?: string
}

/**
 * Establish an authenticated session and land on `target` inside the AppShell.
 *
 * Navigates to the protected `target` first: while unauthenticated the auth
 * guard bounces to `/login?redirect=<target>`; after a successful (stubbed)
 * login the LoginView returns to `<target>` via SPA navigation — so the
 * in-memory token survives (a second `page.goto` would reload the app and wipe
 * it, bouncing back to /login).
 *
 * Caller must have stubbed setup status (`stubSetupDone`) and any data
 * endpoints the target view polls before calling this.
 */
export async function loginAs(page: Page, options: LoginOptions = {}): Promise<void> {
  const { target = '/', username = 'admin', password = 'SecretPass!23' } = options

  await page.route(LOGIN_URL, (route) =>
    route.fulfill({
      status: 201,
      json: {
        data: {
          accessToken: 'tok-test',
          refreshToken: 'rt-test',
          expiresAt: '2099-01-01T00:00:00Z',
          sessionId: 's-test-1',
          userId: 'u-test-1',
          passwordResetRequired: false,
        },
      },
    }),
  )

  // Unauthenticated → guard redirects to /login?redirect=<target>.
  await page.goto(target)
  await page.fill('#login-username', username)
  await page.fill('#login-password', password)
  await page.click('button[type="submit"]')

  // Login view pushes back to <target> via SPA nav → AppShell mounted (<nav> present).
  await expect(page.locator('nav').first()).toBeVisible()
}
