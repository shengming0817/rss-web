import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { AuthorizationExperience } from '../authorization/authorization-context'
import { authorizationExperiencePlugin } from '../authorization/authorization-context'
import type { PoliciesApi, PolicyView } from '@rss/identity'
import { createWebI18n } from '../../i18n'
import { policiesApiPlugin } from './policies-context'
import PoliciesView from './PoliciesView.vue'

const policy = {
  policyId: 'policy-read' as never,
  version: 2,
  contractId: 'identity.policies-get',
  permission: 'identity:policy:read',
  effectiveFrom: 1_700_000_000,
  rules: [],
} satisfies PolicyView

const authorization: AuthorizationExperience = {
  getHint: () => ({
    decision: 'unknown',
    source: { kind: 'server', authority: 'deferred-to-request' },
  }),
  getOutcome: () => ({ status: 'idle' }),
  execute: async (_intent, operation) => operation(),
  subscribe: () => () => undefined,
  dispose: () => undefined,
}

describe('PoliciesView', () => {
  it('loads list and fetches a distinct server detail only after explicit selection', async () => {
    const list = vi.fn().mockResolvedValue({ data: [policy], hasMore: false })
    const get = vi.fn().mockResolvedValue({ data: policy })
    const api = { list, get } as PoliciesApi
    const wrapper = mount(PoliciesView, {
      attachTo: document.body,
      global: {
        plugins: [
          createWebI18n(),
          policiesApiPlugin(api),
          authorizationExperiencePlugin(authorization),
        ],
      },
    })
    await flushPromises()
    expect(list).toHaveBeenCalledOnce()
    expect(get).not.toHaveBeenCalled()
    expect(wrapper.find('[data-source="rss"]').exists()).toBe(true)
    await wrapper.get('.policy-catalog__item').trigger('click')
    await flushPromises()
    expect(get).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('identity.policies-get')
    expect(document.activeElement).toBe(wrapper.get('#policy-detail-title').element)
    wrapper.unmount()
  })

  it('keeps the explicit next control stable while loading and restores focus to the catalog', async () => {
    let resolveNext!: (value: { data: PolicyView[]; hasMore: false }) => void
    const nextPage = new Promise<{ data: PolicyView[]; hasMore: false }>((resolve) => {
      resolveNext = resolve
    })
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: [policy], hasMore: true, nextCursor: 'next' })
      .mockReturnValueOnce(nextPage)
    const wrapper = mount(PoliciesView, {
      attachTo: document.body,
      global: {
        plugins: [
          createWebI18n(),
          policiesApiPlugin({ list, get: vi.fn() } as PoliciesApi),
          authorizationExperiencePlugin(authorization),
        ],
      },
    })
    await flushPromises()
    const next = wrapper.get('button.v1-btn')
    ;(next.element as HTMLButtonElement).focus()
    await next.trigger('click')
    expect(next.attributes('aria-busy')).toBe('true')
    expect(next.attributes()).toHaveProperty('disabled')
    expect(document.activeElement).toBe(next.element)
    resolveNext({ data: [], hasMore: false })
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('#policies-catalog-title').element)
    wrapper.unmount()
  })
})
