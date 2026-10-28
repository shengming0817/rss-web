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
    nextCursor: 'b3BhcXVl',
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
  await wrapper.get('.v-expansion-panel-title').trigger('click')
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '重新读取')!
    .trigger('click')
  await flushPromises()
  expect(list).toHaveBeenCalledWith(
    expect.objectContaining({
      cursor: undefined,
      limit: 50,
      filter: undefined,
      fields: expect.arrayContaining(['id', 'outcome', 'withdrawn']),
    }),
  )
  expect(wrapper.text()).toContain('7.2')
  expect(wrapper.text()).toContain('winget-private')
  expect(wrapper.find('a[href*="resource=editor"]').exists()).toBe(true)
  expect(wrapper.find('a[href*="resource=withdrawn-editor"]').exists()).toBe(true)
  expect(wrapper.find('a[href*="resource=pending-editor"]').exists()).toBe(true)
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
    nextCursor: 'Yg',
  })
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '下一页')!
    .trigger('click')
  await flushPromises()
  expect(list.mock.lastCall?.[0]).toMatchObject({
    cursor: 'b3BhcXVl',
    limit: 50,
    filter: undefined,
  })
  expect(wrapper.find('a[href*="resource="]').exists()).toBe(true)
  list.mockResolvedValueOnce({ items: [], nextCursor: null })
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '下一页')!
    .trigger('click')
  await flushPromises()
  expect(list.mock.lastCall?.[0]).toMatchObject({ cursor: 'Yg', limit: 50 })
  wrapper.unmount()
})
