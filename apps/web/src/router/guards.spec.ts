import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { AuthorizationExperience } from '../features/authorization/authorization-context'
import { registerAuthorizationRouting, registerRouterA11y } from './guards'

const intent = { contractId: 'runtime.inventory', permission: 'runtime:read' }

function hintRouter(decision: 'allow' | 'deny' | 'unknown') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'home',
        component: { template: '<div />' },
        meta: { focusTarget: 'shell-content', sessionAccess: 'authenticated' },
      },
      {
        path: '/runtime',
        name: 'runtime',
        component: { template: '<div />' },
        meta: {
          focusTarget: 'shell-content',
          sessionAccess: 'authenticated',
          authorizationIntent: intent,
        },
      },
    ],
  })
  const authorization = {
    getHint: vi.fn(() => ({
      decision,
      source: { kind: 'preview', authoritative: false, reason: 'scenario' },
    })),
    execute: vi.fn(),
  } as unknown as AuthorizationExperience
  registerAuthorizationRouting(router, authorization)
  return { authorization, router }
}

describe('authorization UX routing', () => {
  it.each(['allow', 'unknown'] as const)(
    'allows %s hints to reach the real route',
    async (decision) => {
      const { router } = hintRouter(decision)
      await router.push('/runtime')
      await router.isReady()
      expect(router.currentRoute.value.name).toBe('runtime')
    },
  )

  it('redirects an explicit Preview deny without executing a network operation', async () => {
    const { authorization, router } = hintRouter('deny')
    await router.push('/runtime')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('home')
    expect(authorization.getHint).toHaveBeenCalledWith(intent)
    expect(authorization.execute).not.toHaveBeenCalled()
  })
})

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
