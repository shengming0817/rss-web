import { describe, expect, it, vi } from 'vitest'
import { router } from './index'

describe('router scope', () => {
  it('exposes only the shell-owned home route', () => {
    const home = router.resolve('/')
    expect(home.name).toBe('home')
    expect(home.matched).toHaveLength(2)
  })

  it.each(['/access', '/config', '/flags', '/admin', '/observability', '/observe', '/audit'])(
    'does not resolve the removed route %s',
    (path) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      expect(router.resolve(path).name).toBeUndefined()
      warn.mockRestore()
    },
  )
})
