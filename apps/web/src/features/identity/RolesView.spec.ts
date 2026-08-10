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
    expect(wrapper.find('main').exists()).toBe(false)
    wrapper.unmount()
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
    wrapper.unmount()
  })
})
