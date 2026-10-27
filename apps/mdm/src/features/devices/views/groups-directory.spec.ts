import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { VSelect } from 'vuetify/components'
import { expect, it, vi } from 'vitest'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import DeviceGroupsPanel from '../components/DeviceGroupsPanel.vue'

async function setup(groupKind?: 'static' | 'dynamic') {
  const list = vi.fn().mockResolvedValue({ items: [], nextCursor: 'next' })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: DeviceGroupsPanel }],
  })
  await router.push('/')
  const wrapper = mount(DeviceGroupsPanel, {
    props: groupKind ? { groupKind } : {},
    global: {
      plugins: [router, mdmI18n()],
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated' }) },
          devices: { groups: { list }, assets: { catalog: async () => ({ fields: [] }) } },
        },
      },
    },
  })
  await flushPromises()
  return { wrapper, list }
}

it('pages the applied group filter while a later name remains an unsubmitted draft', async () => {
  const { wrapper, list } = await setup()
  try {
    const form = wrapper.get('form.task-filterbar')
    await form.get('input[type=search]').setValue('macOS')
    wrapper.findComponent(VSelect).vm.$emit('update:modelValue', 'dynamic')
    await form.trigger('submit')
    await flushPromises()
    expect(list.mock.lastCall?.[0]).toEqual({
      filter: "(name=icontains='macOS');(kind=='dynamic')",
      cursor: undefined,
    })
    await form.get('input[type=search]').setValue('unsubmitted')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '下一页')!
      .trigger('click')
    await flushPromises()
    expect(list.mock.lastCall?.[0]).toEqual({
      filter: "(name=icontains='macOS');(kind=='dynamic')",
      cursor: 'next',
    })
    list.mockRejectedValueOnce(new Error('directory unavailable'))
    await form.trigger('submit')
    await flushPromises()
    expect(wrapper.findAll('button').some((button) => button.text() === '下一页')).toBe(false)
    await form.trigger('submit')
    await flushPromises()
    expect(list.mock.lastCall?.[0]).toEqual({
      filter: "(name=icontains='unsubmitted');(kind=='dynamic')",
      cursor: undefined,
    })
  } finally {
    wrapper.unmount()
  }
})

it('retains the category filter when paging an initial device group directory', async () => {
  const { wrapper, list } = await setup('dynamic')
  try {
    expect(list.mock.lastCall?.[0]).toEqual({ filter: "(kind=='dynamic')" })
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '下一页')!
      .trigger('click')
    await flushPromises()
    expect(list.mock.lastCall?.[0]).toEqual({ filter: "(kind=='dynamic')", cursor: 'next' })
  } finally {
    wrapper.unmount()
  }
})
