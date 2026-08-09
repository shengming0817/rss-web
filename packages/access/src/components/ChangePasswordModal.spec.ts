import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { useIdentitiesStore } from '../stores/useIdentitiesStore'
import type { Identity } from '../api/identities'
import ChangePasswordModal from './ChangePasswordModal.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const user: Identity = {
  id: 'u-1',
  username: 'alice',
  email: 'alice@corp.example',
  status: 'active',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
}

function mountModal(props: Record<string, unknown> = {}) {
  const wrapper = mount(ChangePasswordModal, {
    props: { open: true, user, ...props },
    global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
  })
  const store = useIdentitiesStore()
  return { wrapper, store }
}

const fill = async (
  w: ReturnType<typeof mountModal>['wrapper'],
  oldP = 'oldpass1',
  newP = 'New!2345',
  confirm = 'New!2345',
) => {
  await w.find('#cp-old').setValue(oldP)
  await w.find('#cp-new').setValue(newP)
  await w.find('#cp-confirm').setValue(confirm)
}

describe('ChangePasswordModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders three password inputs when open', () => {
    const { wrapper } = mountModal()
    expect(wrapper.find('#cp-old').attributes('type')).toBe('password')
    expect(wrapper.find('#cp-new').exists()).toBe(true)
    expect(wrapper.find('#cp-confirm').exists()).toBe(true)
  })

  it('calls store.changePassword with old + new on a valid submit', async () => {
    const { wrapper, store } = mountModal()
    vi.mocked(store.changePassword).mockResolvedValue(undefined)
    await fill(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(store.changePassword).toHaveBeenCalledWith('u-1', {
      oldPassword: 'oldpass1',
      newPassword: 'New!2345',
    })
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('blocks submit and flags a mismatch', async () => {
    const { wrapper, store } = mountModal()
    await fill(wrapper, 'oldpass1', 'New!2345', 'Different!9')
    await wrapper.find('form').trigger('submit')
    expect(store.changePassword).not.toHaveBeenCalled()
    expect(wrapper.find('#cp-confirm-error').text()).toBe(
      'access.identities.password.confirmMismatch',
    )
  })

  it('surfaces a server error and keeps the modal open', async () => {
    const { wrapper, store } = mountModal()
    vi.mocked(store.changePassword).mockRejectedValue({
      isAxiosError: true,
      i18nKey: 'errors.ERR_VALIDATION',
    })
    await fill(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('errors.ERR_VALIDATION')
    expect(wrapper.emitted('close')).toBeFalsy()
  })
})
