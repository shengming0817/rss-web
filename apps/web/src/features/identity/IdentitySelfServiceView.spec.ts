import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readonly, ref } from 'vue'
import { createWebI18n } from '../../i18n'
import type { IdentitySession, VerifiedProfile } from '@rss/identity'
import IdentitySelfServiceView from './IdentitySelfServiceView.vue'

const profile = {
  subject: 'verified-subject',
  tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  kind: 'user',
} as VerifiedProfile

vi.mock('./session-context', () => ({
  useIdentitySession: () => ({
    session: {
      changePassword: vi.fn(),
      logout: vi.fn(),
      logoutAll: vi.fn(),
    } as unknown as IdentitySession,
    state: readonly(
      ref({ status: 'authenticated', profile, sessionExpiresAt: 2, accessExpiresAt: 1 }),
    ),
    signOut: vi.fn(),
    signOutPending: readonly(ref(false)),
  }),
}))
vi.mock('../authorization/authorization-context', () => ({
  useAuthorizationIntent: () => ({
    execute: (operation: () => Promise<unknown>) => operation(),
    hint: ref({}),
    outcome: ref({ status: 'idle' }),
  }),
}))

describe('IdentitySelfServiceView', () => {
  it('reuses verified profile and session actions without a nested main landmark', () => {
    const wrapper = mount(IdentitySelfServiceView, {
      global: {
        plugins: [createWebI18n()],
        stubs: { ModalShell: true },
      },
    })
    expect(wrapper.get('h1').text()).toContain('身份与安全')
    expect(wrapper.text()).toContain(profile.subject)
    expect(wrapper.findComponent({ name: 'VerifiedProfilePanel' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'SessionActions' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'PasswordChangeForm' }).exists()).toBe(true)
    expect(wrapper.find('main').exists()).toBe(false)
  })
})
