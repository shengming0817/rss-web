import { describe, expect, it } from 'vitest'
import { router } from './index'

describe('router scope', () => {
  it('keeps login standalone and public', () => {
    const route = router.resolve('/login')
    expect(route.name).toBe('login')
    expect(route.matched).toHaveLength(1)
    expect(route.meta.public).toBe(true)
  })

  it.each([
    ['/', 'home', undefined],
    ['/access/identities', 'access-identities', 'identity'],
    ['/access/policies', 'access-policies', 'policy'],
    ['/audit', 'audit', 'audit'],
    ['/config', 'config', 'config'],
  ])('keeps %s inside the authenticated shell', (path, name, resource) => {
    const route = router.resolve(path)
    expect(route.name).toBe(name)
    expect(route.matched.length).toBeGreaterThanOrEqual(2)
    expect(route.meta.requiresAuth).toBe(true)
    expect(route.meta.requiredResource).toBe(resource)
  })

  it.each([
    '/first-run-setup',
    '/flags',
    '/observe',
    '/cells',
    '/cells/accesscore',
    '/contracts',
    '/deps',
    '/coverage',
    '/groups',
    '/access/decisions',
    '/access/reviews',
  ])('does not resolve removed product route %s', (path) => {
    expect(router.resolve(path).name).toBeUndefined()
  })
})
