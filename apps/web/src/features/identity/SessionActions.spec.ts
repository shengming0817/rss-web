import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createWebI18n } from '../../i18n'
import type { IdentitySession, IdentitySessionState, VerifiedProfile } from '@rss/identity'
import SessionActions from './SessionActions.vue'
import { identitySessionPlugin } from './session-context'
import { registerSessionRouting } from '../../router/guards'

const profile = {
  subject: 'subject',
  tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  kind: 'user',
} as VerifiedProfile

async function mountActions() {
  let state: IdentitySessionState = {
    status: 'authenticated',
    profile,
    sessionExpiresAt: 2,
    accessExpiresAt: 1,
  }
  const listeners = new Set<(next: IdentitySessionState) => void>()
  const session = {
    getState: () => state,
    subscribe: (listener: (next: IdentitySessionState) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    logout: vi.fn(),
    logoutAll: vi.fn(),
  } as unknown as IdentitySession
  const publish = (next: IdentitySessionState) => {
    state = next
    for (const listener of listeners) listener(next)
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/login',
        name: 'login',
        component: { template: '<div />' },
        meta: { sessionAccess: 'anonymous', focusTarget: 'login-content' },
      },
      {
        path: '/',
        name: 'home',
        component: { template: '<div />' },
        meta: { sessionAccess: 'authenticated', focusTarget: 'shell-content' },
      },
    ],
  })
  await router.push('/')
  await router.isReady()
  registerSessionRouting(router, session)
  const wrapper = mount(SessionActions, {
    attachTo: document.body,
    global: { plugins: [createWebI18n(), router, identitySessionPlugin(session)] },
  })
  return { publish, router, session, wrapper }
}

describe('SessionActions', () => {
  it('clears local authority immediately even when remote logout fails', async () => {
    const { publish, router, session, wrapper } = await mountActions()
    vi.mocked(session.logout).mockImplementation(() => {
      publish({ status: 'anonymous' })
      return Promise.reject(new Error('raw server failure'))
    })

    await wrapper.get('[data-testid="logout-current"]').trigger('click')
    expect(session.getState()).toEqual({ status: 'anonymous' })
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.notice).toBeUndefined()
  })

  it('keeps login disabled until a pending logout-all settles', async () => {
    const { publish, session, wrapper } = await mountActions()
    let settle!: () => void
    vi.mocked(session.logoutAll).mockImplementation(() => {
      publish({ status: 'anonymous' })
      return new Promise<void>((resolve) => {
        settle = resolve
      })
    })

    await wrapper.get('[data-testid="logout-all"]').trigger('click')
    await wrapper.get('[data-testid="confirm-logout-all"]').trigger('click')

    expect(session.logoutAll).toHaveBeenCalledOnce()
    settle()
    await flushPromises()
  })

  it('requires an alertdialog confirmation before logout-all', async () => {
    const { publish, session, wrapper } = await mountActions()
    vi.mocked(session.logoutAll).mockImplementation(() => {
      publish({ status: 'anonymous' })
      return Promise.resolve()
    })

    await wrapper.get('[data-testid="logout-all"]').trigger('click')
    expect(wrapper.get('[role="alertdialog"]').attributes('aria-modal')).toBe('true')
    expect(session.logoutAll).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="confirm-logout-all"]').trigger('click')
    await flushPromises()
    expect(session.logoutAll).toHaveBeenCalledOnce()
  })
})
