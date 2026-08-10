import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readonly, ref } from 'vue'
import { createWebI18n } from '../../i18n'

const changePassword = vi.fn()
const execute = vi.fn((operation: () => Promise<unknown>) => operation())
const sessionState = ref({ status: 'authenticated' })

vi.mock('./session-context', () => ({
  useIdentitySession: () => ({ session: { changePassword }, state: readonly(sessionState) }),
}))
vi.mock('../authorization/authorization-context', () => ({
  useAuthorizationIntent: () => ({ execute, hint: ref({}), outcome: ref({ status: 'idle' }) }),
}))

import PasswordChangeForm from './PasswordChangeForm.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('PasswordChangeForm', () => {
  beforeEach(() => {
    changePassword.mockReset()
    execute.mockClear()
    sessionState.value = { status: 'authenticated' }
  })

  it('uses local secret fields and sends no confirmation or authority input', async () => {
    changePassword.mockResolvedValue(undefined)
    const wrapper = mount(PasswordChangeForm, {
      global: { plugins: [createWebI18n()] },
    })
    expect(wrapper.get('#password-current').attributes('autocomplete')).toBe('current-password')
    expect(wrapper.get('#password-new').attributes('autocomplete')).toBe('new-password')
    expect(wrapper.get('#password-confirm').attributes('autocomplete')).toBe('new-password')
    expect(wrapper.find('input[name="tenant"]').exists()).toBe(false)

    await wrapper.get('#password-current').setValue('current-secret')
    await wrapper.get('#password-new').setValue('replacement-secret')
    await wrapper.get('#password-confirm').setValue('replacement-secret')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(changePassword).toHaveBeenCalledOnce()
    expect(changePassword.mock.calls[0]?.[0]).toEqual({
      currentPassword: 'current-secret',
      newPassword: 'replacement-secret',
    })
    expect(JSON.stringify(changePassword.mock.calls[0])).not.toContain('confirm')
    expect(wrapper.html()).not.toContain('current-secret')
    expect(wrapper.html()).not.toContain('replacement-secret')
  })

  it('rejects a local mismatch and focuses confirmation without sending', async () => {
    const wrapper = mount(PasswordChangeForm, {
      attachTo: document.body,
      global: { plugins: [createWebI18n()] },
    })
    await wrapper.get('#password-current').setValue('current')
    await wrapper.get('#password-new').setValue('new-one')
    await wrapper.get('#password-confirm').setValue('new-two')
    await wrapper.get('form').trigger('submit')

    expect(changePassword).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(wrapper.get('#password-confirm').element)
    expect(wrapper.get('[role="alert"]').text()).toContain('不一致')
    wrapper.unmount()
  })

  it('clears fields immediately, keeps a stable busy button, and blocks duplicates', async () => {
    const pending = deferred<void>()
    changePassword.mockReturnValue(pending.promise)
    const wrapper = mount(PasswordChangeForm, {
      global: { plugins: [createWebI18n()] },
    })
    await wrapper.get('#password-current').setValue('current-secret')
    await wrapper.get('#password-new').setValue('replacement-secret')
    await wrapper.get('#password-confirm').setValue('replacement-secret')
    await wrapper.get('form').trigger('submit')

    expect((wrapper.get('#password-current').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('#password-new').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('#password-confirm').element as HTMLInputElement).value).toBe('')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('form').attributes('aria-busy')).toBe('true')
    await wrapper.get('form').trigger('submit')
    expect(changePassword).toHaveBeenCalledOnce()
    pending.resolve()
    await flushPromises()
  })

  it('aborts the operation and releases all field values on unmount', async () => {
    const pending = deferred<void>()
    let signal: AbortSignal | undefined
    changePassword.mockImplementation((_request, options) => {
      signal = options?.signal
      return pending.promise
    })
    const wrapper = mount(PasswordChangeForm, {
      global: { plugins: [createWebI18n()] },
    })
    await wrapper.get('#password-current').setValue('current-secret')
    await wrapper.get('#password-new').setValue('replacement-secret')
    await wrapper.get('#password-confirm').setValue('replacement-secret')
    await wrapper.get('form').trigger('submit')
    wrapper.unmount()
    expect(signal?.aborted).toBe(true)
  })

  it('keeps the form stable but unavailable during session refresh', async () => {
    const wrapper = mount(PasswordChangeForm, {
      global: { plugins: [createWebI18n()] },
    })
    await wrapper.get('#password-current').setValue('current-secret')
    sessionState.value = { status: 'refreshing' }
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toContain('刷新会话')
    expect(wrapper.get('#password-current').attributes('disabled')).toBeDefined()
    expect((wrapper.get('#password-current').element as HTMLInputElement).value).toBe(
      'current-secret',
    )
    await wrapper.get('form').trigger('submit')
    expect(changePassword).not.toHaveBeenCalled()

    sessionState.value = { status: 'authenticated' }
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.get('#password-current').attributes('disabled')).toBeUndefined()
  })
})
