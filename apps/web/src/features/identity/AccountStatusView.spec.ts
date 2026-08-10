import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { decodeWireErrorForTest, networkErrorForTest } from '@rss/api/testing'
import { createWebI18n } from '../../i18n'

const get = vi.fn()
const set = vi.fn()
const invalidateForAccountStatusChange = vi.fn()
const execute = vi.fn((operation: () => Promise<unknown>) => operation())

vi.mock('./account-status-context', () => ({
  useAccountStatusApi: () => ({ get, set }),
}))
vi.mock('./session-context', () => ({
  useIdentitySession: () => ({ session: { invalidateForAccountStatusChange } }),
}))
vi.mock('../authorization/authorization-context', () => ({
  useAuthorizationIntent: () => ({ execute }),
}))

import AccountStatusView from './AccountStatusView.vue'

const userId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function mountView() {
  return mount(AccountStatusView, {
    attachTo: document.body,
    global: { plugins: [createWebI18n()] },
  })
}

async function load(wrapper: ReturnType<typeof mountView>) {
  await wrapper.get('#account-status-user-id').setValue(userId)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('AccountStatusView', () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue({ data: { status: 'active' } })
    set.mockReset().mockResolvedValue({ data: { status: 'suspended', changed: true } })
    invalidateForAccountStatusChange.mockReset().mockReturnValue(false)
    execute.mockClear()
  })

  it('starts request-free and requires an explicit canonical userId', async () => {
    const wrapper = mountView()
    expect(get).not.toHaveBeenCalled()
    expect(wrapper.find('input[name="tenant"]').exists()).toBe(false)
    expect(wrapper.find('input[name="subject"]').exists()).toBe(false)
    await wrapper.get('#account-status-user-id').setValue('not-a-user')
    await wrapper.get('form').trigger('submit')
    expect(get).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('canonical non-nil UUID')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('#account-status-user-id').element)
    wrapper.unmount()
  })

  it('shows only a strict server fact and clears it when input changes', async () => {
    const wrapper = mountView()
    await load(wrapper)
    expect(get).toHaveBeenCalledWith(userId, expect.objectContaining({ signal: expect.anything() }))
    expect(wrapper.find('[data-source="rss"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Active')
    expect(document.activeElement).toBe(wrapper.get('#account-status-operation-title').element)

    await wrapper.get('#account-status-user-id').setValue('9f8c7b6a-5d4e-4321-a987-123456789abc')
    expect(wrapper.find('[data-source="rss"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('已提交 User ID')
    wrapper.unmount()
  })

  it('requires an alertdialog confirmation and submits one exact desired state', async () => {
    const wrapper = mountView()
    await load(wrapper)
    await wrapper.get('#account-status-target').setValue('suspended')
    await wrapper.get('[data-action="prepare-account-status"]').trigger('click')

    const dialog = wrapper.get('[role="alertdialog"]')
    expect(dialog.text()).toContain(userId)
    expect(dialog.text()).toContain('Suspended')
    await wrapper.get('[data-action="confirm-account-status"]').trigger('click')
    await flushPromises()

    expect(set).toHaveBeenCalledOnce()
    expect(set).toHaveBeenCalledWith(
      userId,
      { targetStatus: 'suspended' },
      expect.objectContaining({ signal: expect.anything() }),
    )
    expect(get).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('本次是否变更')
    wrapper.unmount()
  })

  it('moves focus from confirmation to a stable busy status and then the panel heading', async () => {
    const pending = deferred<{ data: { status: 'suspended'; changed: true } }>()
    set.mockReturnValue(pending.promise)
    const wrapper = mountView()
    await load(wrapper)
    await wrapper.get('[data-action="prepare-account-status"]').trigger('click')
    const confirm = wrapper.get('[data-action="confirm-account-status"]')
    ;(confirm.element as HTMLElement).focus()
    await confirm.trigger('click')
    await flushPromises()

    const status = wrapper.get('[role="status"]')
    expect(document.activeElement).toBe(status.element)
    expect(status.attributes('tabindex')).toBe('-1')
    pending.resolve({ data: { status: 'suspended', changed: true } })
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('#account-status-operation-title').element)
    wrapper.unmount()
  })

  it('clears the old fact and exposes no raw text after a final 409', async () => {
    set.mockRejectedValue(
      decodeWireErrorForTest(409, {
        error: {
          code: 'ERR_CORE_CONFLICT',
          message: 'must-not-render',
          retryable: false,
          details: [],
          requestId: 'account-conflict',
        },
      }),
    )
    const wrapper = mountView()
    await load(wrapper)
    await wrapper.get('#account-status-target').setValue('deactivated')
    await wrapper.get('[data-action="prepare-account-status"]').trigger('click')
    await wrapper.get('[data-action="confirm-account-status"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-source="unavailable"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('must-not-render')
    expect(wrapper.text()).not.toContain('服务端状态')
    wrapper.unmount()
  })

  it('invokes the session safety seam for a self-target commit-unknown write', async () => {
    set.mockRejectedValue(networkErrorForTest())
    invalidateForAccountStatusChange.mockReturnValue(true)
    const wrapper = mountView()
    await load(wrapper)
    await wrapper.get('#account-status-target').setValue('locked')
    await wrapper.get('[data-action="prepare-account-status"]').trigger('click')
    await wrapper.get('[data-action="confirm-account-status"]').trigger('click')
    await flushPromises()

    expect(invalidateForAccountStatusChange).toHaveBeenCalledWith(userId, 'locked')
    expect(wrapper.find('[data-source="rss"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('adds no nested main landmark', () => {
    const wrapper = mountView()
    expect(wrapper.find('main').exists()).toBe(false)
    wrapper.unmount()
  })
})
