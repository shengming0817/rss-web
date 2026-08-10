import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { registerRouterA11y } from './guards'

describe('router accessibility', () => {
  it.each([
    { path: '/login', focusTarget: 'login-content' },
    { path: '/', focusTarget: 'shell-content' },
  ] as const)('moves focus to the closed route target for $path', async ({ path, focusTarget }) => {
    const main = document.createElement('main')
    main.id = focusTarget
    main.tabIndex = -1
    document.body.append(main)
    const focus = vi.spyOn(main, 'focus')
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path,
          component: { template: '<div />' },
          meta: { focusTarget, sessionAccess: 'anonymous' },
        },
      ],
    })
    registerRouterA11y(router)

    await router.push(path)
    await router.isReady()
    await Promise.resolve()

    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    main.remove()
  })
})
