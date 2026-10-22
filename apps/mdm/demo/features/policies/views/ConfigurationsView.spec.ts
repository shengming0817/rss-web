import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { ref } from 'vue'
import { expect, it } from 'vitest'
import { demoKey } from '../../../context'
import { mdmI18n } from '../../../../src/i18n'
import ConfigurationsView from './ConfigurationsView.vue'
it('offers only formats compatible with the selected platform and makes an empty catalog explicit', async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ConfigurationsView }],
  })
  await router.push('/')
  const wrapper = mount(ConfigurationsView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [demoKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated', session: { id: 'session' } }) },
          policies: { configurations: { list: async () => ({ items: [], nextCursor: null }) } },
        },
      },
    },
  })
  await flushPromises()
  expect(wrapper.text()).toContain('当前没有结果')
  await wrapper.get('#configuration-platform').setValue('macos')
  expect(wrapper.get<HTMLSelectElement>('#configuration-format').element.value).toBe(
    'apple_profile',
  )
  expect(wrapper.findAll('#configuration-format option').map((o) => o.attributes('value'))).toEqual(
    ['apple_profile', 'apple_ddm'],
  )
  wrapper.unmount()
})
