import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { AuthorizationExperience } from '../authorization/authorization-context'
import { authorizationExperiencePlugin } from '../authorization/authorization-context'
import type { PoliciesApi, PolicyView } from '@rss/identity'
import { decodeWireErrorForTest } from '@rss/api/testing'
import { createWebI18n } from '../../i18n'
import { policiesApiPlugin } from './policies-context'
import PoliciesView from './PoliciesView.vue'

const policy = {
  policyId: 'policy-read' as never,
  version: 2 as never,
  contractId: 'identity.policies-get',
  permission: 'identity:policy:read',
  effectiveFrom: 1_700_000_000,
  rules: [
    {
      condition: {
        attribute: 'principal.kind',
        operator: {
          family: 'equality',
          predicate: 'eq',
          operand: { kind: 'literal', valueType: 'string', value: 'user' },
        },
      },
      effect: 'allow',
    },
  ],
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

function policiesApi(overrides: Partial<PoliciesApi>): PoliciesApi {
  return {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    ...overrides,
  }
}

describe('PoliciesView', () => {
  it('loads list and fetches a distinct server detail only after explicit selection', async () => {
    const list = vi.fn().mockResolvedValue({ data: [policy], hasMore: false })
    const get = vi.fn().mockResolvedValue({ data: policy })
    const api = policiesApi({ list, get })
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
    const detailPanel = wrapper.get('[aria-labelledby="policy-detail-title"]')
    expect(detailPanel.find('[data-source="rss"]').exists()).toBe(true)
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
          policiesApiPlugin(policiesApi({ list, get: vi.fn() })),
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

  it('announces independent catalog and detail failures with unavailable provenance', async () => {
    const listFailure = mount(PoliciesView, {
      global: {
        plugins: [
          createWebI18n(),
          policiesApiPlugin(
            policiesApi({
              list: vi.fn().mockRejectedValue(new Error('offline')),
              get: vi.fn(),
            }),
          ),
          authorizationExperiencePlugin(authorization),
        ],
      },
    })
    await flushPromises()
    expect(listFailure.get('.error-page').attributes('role')).toBe('alert')
    expect(
      listFailure
        .find('[aria-labelledby="policies-catalog-title"] [data-source="unavailable"]')
        .exists(),
    ).toBe(true)
    listFailure.unmount()

    const detailFailure = mount(PoliciesView, {
      global: {
        plugins: [
          createWebI18n(),
          policiesApiPlugin(
            policiesApi({
              list: vi.fn().mockResolvedValue({ data: [policy], hasMore: false }),
              get: vi.fn().mockRejectedValue(new Error('denied')),
            }),
          ),
          authorizationExperiencePlugin(authorization),
        ],
      },
    })
    await flushPromises()
    await detailFailure.get('.policy-catalog__item').trigger('click')
    await flushPromises()
    const detailPanel = detailFailure.get('[aria-labelledby="policy-detail-title"]')
    expect(detailPanel.get('.error-page').attributes('role')).toBe('alert')
    expect(detailPanel.find('[data-source="unavailable"]').exists()).toBe(true)
    detailFailure.unmount()
  })

  it('submits update with the decoded CAS version only after confirmation', async () => {
    const updated = { ...policy, version: 3 }
    const update = vi.fn().mockResolvedValue({ data: updated })
    const api = policiesApi({
      list: vi.fn().mockResolvedValue({ data: [policy], hasMore: false }),
      get: vi.fn().mockResolvedValue({ data: policy }),
      update,
    })
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
    await wrapper.get('.policy-catalog__item').trigger('click')
    await flushPromises()
    await wrapper.findAll('form')[1]!.trigger('submit')
    expect(update).not.toHaveBeenCalled()
    const dialog = wrapper.get('[role="alertdialog"]')
    await dialog.findAll('button').at(-1)!.trigger('click')
    await flushPromises()
    expect(update).toHaveBeenCalledOnce()
    expect(update.mock.calls[0]?.[0]).toBe('policy-read')
    expect(update.mock.calls[0]?.[1]).toMatchObject({ expectedVersion: 2 })
    expect(wrapper.text()).toContain('已由 RSS 确认成功')
    wrapper.unmount()
  })

  it('locks catalog navigation while a write may already be committing', async () => {
    let resolveUpdate!: (value: { data: PolicyView }) => void
    const pending = new Promise<{ data: PolicyView }>((resolve) => {
      resolveUpdate = resolve
    })
    const get = vi.fn().mockResolvedValue({ data: policy })
    const wrapper = mount(PoliciesView, {
      global: {
        plugins: [
          createWebI18n(),
          policiesApiPlugin(
            policiesApi({
              list: vi.fn().mockResolvedValue({ data: [policy], hasMore: false }),
              get,
              update: vi.fn().mockReturnValue(pending),
            }),
          ),
          authorizationExperiencePlugin(authorization),
        ],
      },
    })
    await flushPromises()
    await wrapper.get('.policy-catalog__item').trigger('click')
    await flushPromises()
    await wrapper.findAll('form')[1]!.trigger('submit')
    await wrapper.get('[role="alertdialog"]').findAll('button').at(-1)!.trigger('click')
    await flushPromises()
    expect(wrapper.get('.policy-catalog__item').attributes('disabled')).toBeDefined()
    await wrapper.get('.policy-catalog__item').trigger('click')
    expect(get).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('正在提交')
    resolveUpdate({ data: { ...policy, version: 3 as never } })
    await flushPromises()
    expect(wrapper.text()).toContain('已由 RSS 确认成功')
    wrapper.unmount()
  })

  it('re-reads the selected policy after deactivate instead of retaining stale detail', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: policy })
      .mockResolvedValueOnce({ data: { ...policy, version: 3 as never } })
    const wrapper = mount(PoliciesView, {
      global: {
        plugins: [
          createWebI18n(),
          policiesApiPlugin(
            policiesApi({
              list: vi.fn().mockResolvedValue({ data: [policy], hasMore: false }),
              get,
              deactivate: vi.fn().mockResolvedValue({ data: { deactivated: true, version: 3 } }),
            }),
          ),
          authorizationExperiencePlugin(authorization),
        ],
      },
    })
    await flushPromises()
    await wrapper.get('.policy-catalog__item').trigger('click')
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '准备停用')!
      .trigger('click')
    const description = wrapper.get('#policy-write-confirm-description').text()
    expect(description).toContain('policy-read')
    expect(description).toContain('2')
    await wrapper.get('[role="alertdialog"]').findAll('button').at(-1)!.trigger('click')
    await flushPromises()
    expect(get).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('版本 3')
    wrapper.unmount()
  })

  it('keeps a conflicted draft and re-reads only after the explicit reconcile action', async () => {
    const conflict = decodeWireErrorForTest(409, {
      error: {
        code: 'ERR_CORE_VERSION_CONFLICT',
        message: 'version conflict',
        retryable: true,
        details: [],
        requestId: 'policy-conflict-rid',
      },
    })
    const list = vi.fn().mockResolvedValue({ data: [policy], hasMore: false })
    let resolveReconciliation!: (value: { data: PolicyView }) => void
    const reconciliation = new Promise<{ data: PolicyView }>((resolve) => {
      resolveReconciliation = resolve
    })
    const get = vi.fn().mockResolvedValueOnce({ data: policy }).mockReturnValueOnce(reconciliation)
    const update = vi.fn().mockRejectedValue(conflict)
    const wrapper = mount(PoliciesView, {
      global: {
        plugins: [
          createWebI18n(),
          policiesApiPlugin(policiesApi({ list, get, update })),
          authorizationExperiencePlugin(authorization),
        ],
      },
    })
    await flushPromises()
    await wrapper.get('.policy-catalog__item').trigger('click')
    await flushPromises()
    const permission = wrapper.get(
      '[aria-labelledby="policy-update-title"] [data-field-path="permission"]',
    )
    await permission.setValue('identity:policy:draft-retained')
    await wrapper.findAll('form')[1]!.trigger('submit')
    await wrapper.get('[role="alertdialog"]').findAll('button').at(-1)!.trigger('click')
    await flushPromises()
    expect(update).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('草稿已保留')
    expect(list).toHaveBeenCalledOnce()
    expect(get).toHaveBeenCalledOnce()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '重新读取服务端状态')!
      .trigger('click')
    await flushPromises()
    expect(update).toHaveBeenCalledOnce()
    expect(list).toHaveBeenCalledTimes(2)
    expect(get).toHaveBeenCalledTimes(2)
    expect(
      (
        wrapper.get('[aria-labelledby="policy-update-title"] [data-field-path="permission"]')
          .element as HTMLInputElement
      ).value,
    ).toBe('identity:policy:draft-retained')
    expect(wrapper.get('.policy-catalog__item').attributes('disabled')).toBeDefined()
    resolveReconciliation({ data: { ...policy, version: 3 as never } })
    await flushPromises()
    expect(
      (
        wrapper.get('[aria-labelledby="policy-update-title"] [data-field-path="permission"]')
          .element as HTMLInputElement
      ).value,
    ).toBe('identity:policy:draft-retained')
    expect(wrapper.text()).toContain('版本 3')
    expect(wrapper.text()).not.toContain('草稿已保留')
    expect(wrapper.get('.policy-catalog__item').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
})
