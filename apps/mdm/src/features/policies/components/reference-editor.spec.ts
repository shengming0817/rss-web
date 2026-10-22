import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
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
  await wrapper.get('select').setValue('group')
  await button('从授权目录选择').trigger('click')
  await flushPromises()
  expect(wrapper.get('datalist').text()).toContain('First · 版本 7')
  await button('下一页').trigger('click')
  await flushPromises()
  expect(groups.mock.calls[1]?.[0]).toEqual({ after: 'g1' })
  expect(wrapper.get('datalist').text()).toContain('Second')
  expect(wrapper.text()).toContain('saved')
  await wrapper.get('select').setValue('device')
  expect(wrapper.findAll('datalist option')).toHaveLength(0)
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  wrapper.unmount()
})
