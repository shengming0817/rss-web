import { describe, it, expect } from 'vitest'
import { router } from './index'

/**
 * Asserts the structural layout fork: auth pages resolve standalone (a single
 * matched record), while in-shell pages resolve nested under AppShellLayout
 * (≥ 2 matched records). This is what keeps login / first-run out of the shell
 * chrome without relying on a runtime meta flag.
 */
describe('router layout fork', () => {
  it('renders /login standalone (no shell layout wrapper)', () => {
    const m = router.resolve('/login')
    expect(m.name).toBe('login')
    expect(m.matched).toHaveLength(1)
  })

  it('renders /first-run-setup standalone', () => {
    const m = router.resolve('/first-run-setup')
    expect(m.name).toBe('first-run-setup')
    expect(m.matched).toHaveLength(1)
  })

  it('renders / nested under the shell layout, behind the auth gate (Batch 7 Health overview)', () => {
    const m = router.resolve('/')
    expect(m.name).toBe('home')
    expect(m.matched.length).toBeGreaterThanOrEqual(2)
    expect(m.meta.requiresAuth).toBe(true)
    // No PDP resource — operational dashboard accessible to any authenticated admin.
    expect(m.meta.requiredAction).toBeUndefined()
    expect(m.meta.requiredResource).toBeUndefined()
  })

  it('renders /observe nested under the shell, auth-gated only (Batch 7 Observability)', () => {
    const m = router.resolve('/observe')
    expect(m.name).toBe('observe')
    expect(m.matched.length).toBeGreaterThanOrEqual(2)
    expect(m.meta.requiresAuth).toBe(true)
    // No PDP resource — observe view is accessible to any authenticated admin.
    expect(m.meta.requiredAction).toBeUndefined()
    expect(m.meta.requiredResource).toBeUndefined()
  })

  it('keeps auth routes public', () => {
    expect(router.resolve('/login').meta.public).toBe(true)
    expect(router.resolve('/first-run-setup').meta.public).toBe(true)
  })

  it('renders /access/identities nested under the shell, behind the auth + PDP gates', () => {
    const m = router.resolve('/access/identities')
    expect(m.name).toBe('access-identities')
    expect(m.matched.length).toBeGreaterThanOrEqual(2)
    expect(m.meta.requiresAuth).toBe(true)
    // PDP fail-closed gate (read on identity) — guards.ts denies until the PDP backend allows.
    expect(m.meta.requiredAction).toBe('read')
    expect(m.meta.requiredResource).toBe('identity')
  })

  it('renders /audit nested under the shell, behind the auth + PDP gates (Batch 4)', () => {
    const m = router.resolve('/audit')
    expect(m.name).toBe('audit')
    expect(m.matched.length).toBeGreaterThanOrEqual(2)
    expect(m.meta.requiresAuth).toBe(true)
    // PDP fail-closed gate (read on audit) — guards.ts denies until the PDP backend allows.
    expect(m.meta.requiredAction).toBe('read')
    expect(m.meta.requiredResource).toBe('audit')
  })

  it('renders /config nested under the shell, behind the auth + PDP gates (Batch 4)', () => {
    const m = router.resolve('/config')
    expect(m.name).toBe('config')
    expect(m.matched.length).toBeGreaterThanOrEqual(2)
    expect(m.meta.requiresAuth).toBe(true)
    expect(m.meta.requiredAction).toBe('read')
    expect(m.meta.requiredResource).toBe('config')
  })

  it('renders /flags nested under the shell, behind the auth + PDP gates (Batch 4)', () => {
    const m = router.resolve('/flags')
    expect(m.name).toBe('flags')
    expect(m.matched.length).toBeGreaterThanOrEqual(2)
    expect(m.meta.requiresAuth).toBe(true)
    expect(m.meta.requiredAction).toBe('read')
    expect(m.meta.requiredResource).toBe('flag')
  })

  it('renders /cells nested under the shell, behind the auth + PDP gates (Batch 5)', () => {
    const m = router.resolve('/cells')
    expect(m.name).toBe('cells')
    expect(m.matched.length).toBeGreaterThanOrEqual(2)
    expect(m.meta.requiresAuth).toBe(true)
    expect(m.meta.requiredAction).toBe('read')
    expect(m.meta.requiredResource).toBe('cell')
  })

  it('renders /cells/:id detail behind the auth + PDP gates, carrying the id param (Batch 5)', () => {
    const m = router.resolve('/cells/accesscore')
    expect(m.name).toBe('cell-detail')
    expect(m.params.id).toBe('accesscore')
    expect(m.matched.length).toBeGreaterThanOrEqual(2)
    expect(m.meta.requiresAuth).toBe(true)
    expect(m.meta.requiredAction).toBe('read')
    expect(m.meta.requiredResource).toBe('cell')
  })

  it('renders /contracts nested under the shell, gate degraded to cell (Batch 6)', () => {
    const m = router.resolve('/contracts')
    expect(m.name).toBe('contracts')
    expect(m.matched.length).toBeGreaterThanOrEqual(2)
    expect(m.meta.requiresAuth).toBe(true)
    expect(m.meta.requiredAction).toBe('read')
    expect(m.meta.requiredResource).toBe('cell')
  })

  it('renders /deps nested under the shell, gate degraded to cell (Batch 6)', () => {
    const m = router.resolve('/deps')
    expect(m.name).toBe('deps')
    expect(m.matched.length).toBeGreaterThanOrEqual(2)
    expect(m.meta.requiresAuth).toBe(true)
    expect(m.meta.requiredAction).toBe('read')
    expect(m.meta.requiredResource).toBe('cell')
  })

  it('renders /coverage behind only the auth gate — a self-referential meta page (Batch 6)', () => {
    const m = router.resolve('/coverage')
    expect(m.name).toBe('coverage')
    expect(m.matched.length).toBeGreaterThanOrEqual(2)
    expect(m.meta.requiresAuth).toBe(true)
    // No PDP resource exists for a dev-tool self-overview — auth gate only.
    expect(m.meta.requiredAction).toBeUndefined()
    expect(m.meta.requiredResource).toBeUndefined()
  })

  it('renders /groups nested under the shell, gate degraded to cell (Batch 6)', () => {
    const m = router.resolve('/groups')
    expect(m.name).toBe('groups')
    expect(m.matched.length).toBeGreaterThanOrEqual(2)
    expect(m.meta.requiresAuth).toBe(true)
    expect(m.meta.requiredAction).toBe('read')
    expect(m.meta.requiredResource).toBe('cell')
  })
})
