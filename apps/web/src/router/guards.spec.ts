import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { registerRouterA11y } from './guards'

describe('router accessibility', () => {
  it('moves focus to shell content after navigation', async () => {
    const main = document.createElement('main')
    main.id = 'shell-content'
    main.tabIndex = -1
    document.body.append(main)
    const focus = vi.spyOn(main, 'focus')
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    registerRouterA11y(router)

    await router.push('/')
    await router.isReady()
    await Promise.resolve()

    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    main.remove()
  })
})
