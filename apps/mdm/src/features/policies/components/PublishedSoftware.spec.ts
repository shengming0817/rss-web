import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { expect, it, vi } from 'vitest'
import { createFeatureRouter } from '../../../../tests/feature-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import PublishedSoftware from './PublishedSoftware.vue'
it('browses published exact software versions through the formal publication directory with opaque pagination', async () => {
  const list = vi.fn().mockResolvedValue({
    items: [
      {
        id: 'publication',
        resource: 'editor',
        version: '7.2',
        target: 'winget-private',
        outcome: 'published',
        withdrawn: false,
      },
      {
        id: 'withdrawn',
        resource: 'withdrawn-editor',
        version: '7.1',
        target: 'winget-private',
        outcome: 'published',
        withdrawn: true,
      },
      {
        id: 'pending',
        resource: 'pending-editor',
        version: '8',
        target: 'winget-private',
        outcome: 'pending',
        withdrawn: false,
      },
    ],
    nextCursor: 'opaque',
  })
  const router = createFeatureRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: PublishedSoftware }],
  })
  await router.push('/')
  const wrapper = mount(PublishedSoftware, {
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated' }) },
          software: { publication: { list } },
        },
      },
    },
  })
  await wrapper.get('button').trigger('click')
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '重新读取')!
    .trigger('click')
  await flushPromises()
  expect(list).toHaveBeenCalledWith({
    cursor: undefined,
  })
  expect(wrapper.text()).toContain('7.2')
  expect(wrapper.text()).toContain('winget-private')
  expect(wrapper.find('a[href*="resource=editor"]').exists()).toBe(true)
  expect(wrapper.find('a[href*="resource=withdrawn-editor"]').exists()).toBe(false)
  expect(wrapper.find('a[href*="resource=pending-editor"]').exists()).toBe(false)
  list.mockResolvedValueOnce({
    items: [
      {
        id: 'pending',
        resource: 'pending-editor',
        version: '8',
        target: 'winget-private',
        outcome: 'pending',
        withdrawn: false,
      },
    ],
    nextCursor: 'continued',
  })
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '下一页')!
    .trigger('click')
  await flushPromises()
  expect(list.mock.lastCall?.[0]).toEqual({
    cursor: 'opaque',
  })
  expect(wrapper.find('a[href*="resource="]').exists()).toBe(false)
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '下一页')!
    .trigger('click')
  await flushPromises()
  expect(list.mock.lastCall?.[0]).toEqual({ cursor: 'continued' })
  wrapper.unmount()
})
