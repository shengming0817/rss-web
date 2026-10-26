import { selectControl } from '../vuetify-test-controls'
import { createFeatureRouter as createRouter } from '../../../../tests/feature-router'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { expect, it, vi } from 'vitest'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import ReferenceEditor from './ReferenceEditor.vue'

it('paginates authorized references without discarding saved references and clears choices across kinds', async () => {
  const groups = vi
    .fn()
    .mockResolvedValueOnce({
      items: [{ id: 'g1', revision: 7, presentation: { name: 'First' } }],
      nextCursor: 'g1',
    })
    .mockResolvedValueOnce({
      items: [{ id: 'g2', revision: 8, presentation: { name: 'Second' } }],
      nextCursor: null,
    })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ReferenceEditor }],
  })
  await router.push('/')
  const wrapper = mount(ReferenceEditor, {
    attachTo: document.body,
    props: { label: 'Targets', modelValue: [{ kind: 'group', id: 'saved' }] },
    global: {
      plugins: [router, mdmI18n()],
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated' }) },
          devices: { groups: { list: groups } },
        },
      },
    },
  })
  const button = (label: string) => wrapper.findAll('button').find((b) => b.text() === label)!
  await selectControl(wrapper, 'select').setValue('group')
  await button('从授权目录选择').trigger('click')
  await flushPromises()
  expect(JSON.stringify(selectControl(wrapper, 'select[id$="-choice"]').props('items'))).toContain(
    'First · 版本 7',
  )
  await button('下一页').trigger('click')
  await flushPromises()
  expect(groups.mock.calls[1]?.[0]).toEqual({ cursor: 'g1' })
  expect(JSON.stringify(selectControl(wrapper, 'select[id$="-choice"]').props('items'))).toContain(
    'Second',
  )
  expect(wrapper.text()).toContain('saved')
  await selectControl(wrapper, 'select').setValue('device')
  expect(wrapper.find('input[id$="-choice"]').exists()).toBe(false)
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  wrapper.unmount()
})
