import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createWebI18n } from '../../i18n'

const list = vi.fn()
const assign = vi.fn()
const revoke = vi.fn()
const execute = vi.fn((operation: () => Promise<unknown>) => operation())

vi.mock('./roles-context', () => ({
  useRolesApi: () => ({ list, assign, revoke }),
}))
vi.mock('../authorization/authorization-context', () => ({
  useAuthorizationIntent: () => ({ execute }),
}))

import RolesView from './RolesView.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => (resolve = resolvePromise))
  return { promise, resolve }
}

function button(wrapper: ReturnType<typeof mountView>, text: string) {
  const match = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  if (!match) throw new Error(`missing button ${text}`)
  return match
}

function mountView() {
  return mount(RolesView, {
    attachTo: document.body,
    global: { plugins: [createWebI18n()] },
  })
}

describe('RolesView', () => {
  beforeEach(() => {
    list.mockReset().mockResolvedValue({
      data: [
        {
          roleId: 'ops:admin',
          name: 'Operations',
          permissions: ['identity:role:read', 'settings.config-get'],
        },
      ],
      hasMore: false,
    })
    assign.mockReset().mockResolvedValue({ data: { assigned: true } })
    revoke.mockReset().mockResolvedValue({ data: { revoked: false } })
    execute.mockClear()
  })

  it('loads the real catalog but treats permission strings as opaque display facts', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(list).toHaveBeenCalledWith({ limit: 50 }, { signal: expect.any(AbortSignal) })
    expect(wrapper.find('[data-source="rss"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('settings.config-get')
    expect(wrapper.text()).toContain('不代表当前用户或目标 subject 的有效权限')
    expect(wrapper.text()).toContain('这些操作需要 RSS Admin authority')
    expect(wrapper.text()).toContain('当前 User 会话会收到服务端最终 403')
    expect(wrapper.find('main').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not move focus when the automatic catalog request completes', async () => {
    const pending = deferred<Awaited<ReturnType<typeof list>>>()
    list.mockReturnValueOnce(pending.promise)
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const wrapper = mountView()
    pending.resolve({ data: [], hasMore: false })
    await flushPromises()
    expect(document.activeElement).toBe(opener)
    wrapper.unmount()
    opener.remove()
  })

  it('requires explicit subject and confirmation, then drops subject from receipt DOM', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#roles-role-id').setValue('ops:admin')
    await wrapper.get('#roles-subject').setValue('target@example.test')
    await wrapper.get('button.v1-btn').trigger('click')
    const dialog = wrapper.get('[role="alertdialog"]')
    expect(dialog.text()).toContain('target@example.test')
    await dialog.get('button.v1-btn').trigger('click')
    await flushPromises()
    expect(assign).toHaveBeenCalledOnce()
    expect(wrapper.text()).not.toContain('target@example.test')
    expect(wrapper.text()).toContain('这不是当前 binding 视图')
    wrapper.unmount()
  })

  it('keeps list denial independent from explicit revoke', async () => {
    list.mockRejectedValue(new Error('sanitized list failure'))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#roles-role-id').setValue('ops')
    await wrapper.get('#roles-subject').setValue('opaque')
    const buttons = wrapper.findAll('button.v1-ghost')
    await buttons.at(-1)?.trigger('click')
    await wrapper.get('[role="alertdialog"]').get('button.v1-btn').trigger('click')
    await flushPromises()
    expect(revoke).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('本次 revoke receipt')
    wrapper.unmount()
  })

  it('rejects invalid coordinates before command transport and focuses the field', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#roles-role-id').setValue('bad/path')
    await wrapper.get('#roles-subject').setValue('target')
    await wrapper.get('button.v1-btn').trigger('click')
    await flushPromises()
    expect(assign).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(wrapper.get('#roles-role-id').element)
    expect(wrapper.get('#roles-role-id').attributes('aria-describedby')).toBe('roles-role-id-error')
    await wrapper.get('#roles-role-id').setValue('ops')
    await wrapper.get('#roles-subject').setValue('')
    await button(wrapper, 'Assign').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('#roles-subject').element)
    expect(wrapper.get('#roles-subject').attributes('aria-describedby')).toBe(
      'roles-subject-hint roles-subject-error',
    )
    wrapper.unmount()
  })

  it('keeps confirmation focus deterministic and exposes a truthful busy state', async () => {
    const pending = deferred<{ data: { assigned: boolean } }>()
    assign.mockReturnValueOnce(pending.promise)
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#roles-role-id').setValue('ops')
    await wrapper.get('#roles-subject').setValue('target')
    const assignButton = button(wrapper, 'Assign')
    assignButton.element.focus()
    await assignButton.trigger('click')
    await button(wrapper, '取消').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(assignButton.element)

    await assignButton.trigger('click')
    await button(wrapper, '提交命令').trigger('click')
    await flushPromises()
    const busy = wrapper.get('[role="status"][tabindex="-1"]')
    expect(document.activeElement).toBe(busy.element)
    expect(wrapper.get('form').attributes('aria-busy')).toBe('true')
    expect(button(wrapper, 'Assign').attributes('disabled')).toBeDefined()
    expect(button(wrapper, 'Revoke').attributes('disabled')).toBeDefined()
    expect(wrapper.find('#roles-subject-error').exists()).toBe(false)

    pending.resolve({ data: { assigned: true } })
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('#roles-command-title').element)
    wrapper.unmount()
  })
})
