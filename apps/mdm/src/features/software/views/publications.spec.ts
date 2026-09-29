import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import PublicationsView from './PublicationsView.vue'
it('keeps an unknown withdrawal unresolved after GET and replays the identical operation, without treating old publication as deletion evidence', async () => {
  const value = {
    id: 'app',
    revision: 4,
    disposition: 'active',
    contentDigest: [],
    sourceSnapshot: [],
    manifestDigest: [],
    rings: ['test', 'pilot', 'production'].map((ring) => ({
      ring,
      state: 'publication',
      approval: { approver: 'reviewer', publisher: 'operator', at: 1, digest: [] },
      publication: { id: Array<number>(32).fill(1), attempt: 1, outcome: 'published' },
    })),
  }
  const read = vi.fn().mockResolvedValue(value),
    change = vi
      .fn()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValue({ ...value, disposition: 'deprecated', revision: 5 })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: PublicationsView }],
  })
  await router.push('/')
  const wrapper = mount(PublicationsView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          demo: true,
          software: {
            publication: { read, change },
            catalog: {
              publications: vi.fn().mockResolvedValue({
                items: [{ source: 'second-source', id: 'second', disposition: 'active' }],
                nextCursor: null,
              }),
            },
          },
        },
      },
    },
  })
  await flushPromises()
  await wrapper.get('#publication-source').setValue('source')
  await wrapper.get('#publication-id').setValue('app')
  await wrapper.findAll('form')[0]!.trigger('submit')
  await flushPromises()
  await wrapper.get('[data-action="withdraw-test"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('提交结果未知')
  await wrapper.get('[data-action="reconcile"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-action="withdraw-test"]').attributes('disabled')).toBeDefined()
  expect(wrapper.find('[data-withdrawal-ack]').exists()).toBe(false)
  await wrapper.get('[data-action="replay"]').trigger('click')
  await flushPromises()
  expect(change.mock.calls[1]).toEqual(change.mock.calls[0])
  expect(wrapper.get('[data-withdrawal-ack]').text()).toContain('撤回请求已确认')
  expect(wrapper.text()).toContain('历史发布结果')
  await wrapper.get('#publication-publisher').setValue('First publisher')
  await wrapper.get('li button').trigger('click')
  await flushPromises()
  expect(read).toHaveBeenLastCalledWith('second-source', 'second')
  expect((wrapper.get('#publication-publisher').element as HTMLInputElement).value).toBe('')
  wrapper.unmount()
})
