import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { expect, it, vi } from 'vitest'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import SoftwareResourceSelect from './SoftwareResourceSelect.vue'
it('signals binding invalidation for both catalog resource and version selection', async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: {} }],
  })
  await router.push('/')
  const list = vi.fn(async () => ({
    items: [
      {
        resource: { id: 'new-app', versions: [{ id: '2', state: 'active' }] },
        metadata: { definition: { title: 'New app' } },
      },
    ],
    nextCursor: null,
  }))
  const wrapper = mount(SoftwareResourceSelect, {
    props: { resource: 'old-app', version: '1' },
    global: {
      plugins: [router, mdmI18n()],
      provide: {
        [mdmKey as symbol]: {
          software: { catalog: { list } },
          session: { state: ref({ session: { id: 'session' } }) },
        },
      },
    },
  })
  await wrapper.get('button').trigger('click')
  await flushPromises()
  await wrapper.get('select').setValue('new-app')
  expect(wrapper.emitted('update:resource')?.at(-1)).toEqual(['new-app'])
  expect(wrapper.emitted('update:version')?.at(-1)).toEqual([''])
  expect(wrapper.emitted('change')).toHaveLength(1)
  await wrapper.setProps({ resource: 'new-app', version: '' })
  await wrapper.findAll('select')[1]!.setValue('2')
  expect(wrapper.emitted('change')).toHaveLength(2)
  wrapper.unmount()
  router.options.history.destroy()
})
