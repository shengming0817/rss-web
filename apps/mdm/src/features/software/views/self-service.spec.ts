import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import SelfServiceView from './SelfServiceView.vue'
it('shows administrator decisions separately from installation and reconciles only the exact request operation', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const pending = {
    id,
    revision: 1,
    operation: id,
    phase: 'pending',
    requester: 'employee',
    device: 'device-01',
    createdAt: 1,
    item: { id, revision: 1, title: 'Browser', resource: { id: 'browser', version: '1' } },
    decisions: [],
    policy: null,
    execution: null,
  }
  const decide = vi.fn().mockRejectedValue(new Error('response lost'))
  const request = vi.fn(async (target: string) =>
    decide.mock.calls.length
      ? {
          ...pending,
          id: target,
          phase: 'approved',
          revision: 2,
          operation: decide.mock.calls[0]?.[1].operationId ?? id,
          policy: { id, versionId: id },
        }
      : pending,
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: SelfServiceView }],
  })
  await router.push('/')
  const wrapper = mount(SelfServiceView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: id,
          demo: true,
          software: {
            selfService: {
              items: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
              requests: vi.fn().mockResolvedValue({
                items: [pending, { ...pending, id: 'second-request' }],
                nextCursor: null,
              }),
              request,
              decide,
            },
          },
        },
      },
    },
  })
  await flushPromises()
  await wrapper.get('[data-action="open-request"]').trigger('click')
  await flushPromises()
  await wrapper.get('#request-note').setValue('Reviewed')
  await wrapper.get('[data-action="approve-request"]').trigger('click')
  await flushPromises()
  expect(decide.mock.calls[0]![1].input).toEqual({ action: 'approve', note: 'Reviewed' })
  expect(wrapper.text()).toContain('提交结果未知')
  await wrapper.get('[data-action="read-request"]').trigger('click')
  await flushPromises()
  expect(decide).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('批准不表示已安装')
  await wrapper.get('#request-note').setValue('First request only')
  await wrapper.findAll('[data-action="open-request"]')[1]!.trigger('click')
  await flushPromises()
  expect((wrapper.get('#request-note').element as HTMLInputElement).value).toBe('')
  await wrapper.get('[data-action="read-request"]').trigger('click')
  await flushPromises()
  expect(request).toHaveBeenLastCalledWith('second-request')
  wrapper.unmount()
})
