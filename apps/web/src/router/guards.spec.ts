import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { useAuthStore } from '@gocell/access'
import type { Decision, PdpClient } from '@gocell/core'
import { registerGuards } from './guards'

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      {
        path: '/login',
        name: 'login',
        component: { template: '<div />' },
        meta: { requiresAuth: false, public: true },
      },
      { path: '/protected', name: 'protected', component: { template: '<div />' } },
      {
        path: '/pdp',
        name: 'pdp',
        component: { template: '<div />' },
        meta: { requiredAction: 'read', requiredResource: 'config' },
      },
    ],
  })
}

function setSession(): void {
  useAuthStore().setSession({
    userId: 'u1',
    accessToken: 'token',
    refreshToken: 'refresh',
    expiresAt: '2099-01-01T00:00:00Z',
    sessionId: 'session',
    passwordResetRequired: false,
  })
}

function pdp(effect: 'allow' | 'deny'): PdpClient {
  return {
    can: vi.fn(),
    decide: vi.fn().mockResolvedValue({
      effect,
      reasonCode: effect === 'allow' ? '' : 'role-missing',
    } satisfies Decision),
  }
}

function setup(client: PdpClient | null = pdp('allow'), denied?: (reason: string) => void) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const app = createApp({ template: '<router-view />' })
  app.use(pinia)
  const router = makeRouter()
  registerGuards(router, app, client ?? undefined, denied)
  app.use(router)
  return router
}

describe('route guards', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('redirects an unauthenticated protected request and preserves its target', async () => {
    const router = setup()
    await router.push('/protected')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/protected')
  })

  it('allows the public login route without a session', async () => {
    const router = setup()
    await router.push('/login')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('allows an authenticated protected request', async () => {
    const router = setup()
    setSession()
    await router.push('/protected')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('protected')
  })

  it('awaits PDP allow decisions with the declared resource', async () => {
    const client = pdp('allow')
    const router = setup(client)
    setSession()
    await router.push('/pdp')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('pdp')
    expect(client.decide).toHaveBeenCalledWith('read', 'config')
  })

  it('fails closed and reports the PDP denial reason', async () => {
    const denied = vi.fn()
    const router = setup(pdp('deny'), denied)
    setSession()
    await router.push('/pdp')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('home')
    expect(denied).toHaveBeenCalledWith('role-missing')
  })

  it('fails closed when no PDP client is wired', async () => {
    const denied = vi.fn()
    const router = setup(null, denied)
    setSession()
    await router.push('/pdp')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('home')
    expect(denied).toHaveBeenCalledWith('error')
  })

  it('runs authentication before PDP', async () => {
    const client = pdp('deny')
    const router = setup(client)
    await router.push('/pdp')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('login')
    expect(client.decide).not.toHaveBeenCalled()
  })

  it('moves focus to the shell content after navigation', async () => {
    const main = document.createElement('main')
    main.id = 'shell-content'
    main.tabIndex = -1
    document.body.append(main)
    const focus = vi.spyOn(main, 'focus')
    const router = setup()
    await router.push('/login')
    await router.isReady()
    await Promise.resolve()
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })
})
