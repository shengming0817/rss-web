import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { useIdentitiesStore } from '../stores/useIdentitiesStore'
import type { Identity } from '../api/identities'
import IdentityFormModal from './IdentityFormModal.vue'

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
  const wrapper = mount(IdentityFormModal, {
    props: { open: true, user: null, ...props },
    global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
  })
  const store = useIdentitiesStore()
  return { wrapper, store }
}

const fillCreate = async (w: ReturnType<typeof mountModal>['wrapper']) => {
  await w.find('#identity-username').setValue('bob')
  await w.find('#identity-email').setValue('bob@corp.example')
  await w.find('#identity-password').setValue('Secret!23')
}

describe('IdentityFormModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing when closed', () => {
    const { wrapper } = mountModal({ open: false })
    expect(wrapper.find('#identity-form-title').exists()).toBe(false)
  })

  it('shows the create title and a password field in create mode', () => {
    const { wrapper } = mountModal({ user: null })
    expect(wrapper.find('#identity-form-title').text()).toBe('access.identities.form.createTitle')
    expect(wrapper.find('#identity-password').exists()).toBe(true)
    expect(wrapper.find('#identity-username').attributes('readonly')).toBeUndefined()
  })

  it('prefills and locks username, hides password, in edit mode', () => {
    const { wrapper } = mountModal({ user })
    expect(wrapper.find('#identity-form-title').text()).toBe('access.identities.form.editTitle')
    expect((wrapper.find('#identity-email').element as HTMLInputElement).value).toBe(
      'alice@corp.example',
    )
    expect(wrapper.find('#identity-username').attributes('readonly')).toBeDefined()
    expect(wrapper.find('#identity-password').exists()).toBe(false)
  })

  it('blocks submit and shows field errors when create input is invalid', async () => {
    const { wrapper, store } = mountModal({ user: null })
    await wrapper.find('form').trigger('submit')
    expect(store.create).not.toHaveBeenCalled()
    expect(wrapper.find('#identity-username-error').exists()).toBe(true)
    expect(wrapper.find('#identity-username').attributes('aria-invalid')).toBe('true')
  })

  it('calls store.create with the form body and emits saved + close', async () => {
    const { wrapper, store } = mountModal({ user: null })
    vi.mocked(store.create).mockResolvedValue(undefined)
    await fillCreate(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(store.create).toHaveBeenCalledWith({
      username: 'bob',
      email: 'bob@corp.example',
      password: 'Secret!23',
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('includes requirePasswordReset when the box is checked', async () => {
    const { wrapper, store } = mountModal({ user: null })
    vi.mocked(store.create).mockResolvedValue(undefined)
    await fillCreate(wrapper)
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({ requirePasswordReset: true }),
    )
  })

  it('calls store.edit with the user id and patched email in edit mode', async () => {
    const { wrapper, store } = mountModal({ user })
    vi.mocked(store.edit).mockResolvedValue(undefined)
    await wrapper.find('#identity-email').setValue('new@corp.example')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(store.edit).toHaveBeenCalledWith('u-1', { email: 'new@corp.example' })
  })

  it('surfaces a server error and keeps the modal open', async () => {
    const { wrapper, store } = mountModal({ user: null })
    vi.mocked(store.create).mockRejectedValue({
      isAxiosError: true,
      i18nKey: 'errors.ERR_CONFLICT',
    })
    await fillCreate(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('errors.ERR_CONFLICT')
    expect(wrapper.emitted('close')).toBeFalsy()
  })
})
