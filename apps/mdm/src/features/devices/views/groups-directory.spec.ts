import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { VSelect } from 'vuetify/components'
import { expect, it, vi } from 'vitest'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import DeviceGroupsPanel from '../components/DeviceGroupsPanel.vue'
import GroupsView from './GroupsView.vue'

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

it.each(['device-dynamic', 'device-static'])(
  'discovers, searches and pages read-only system groups from the %s root category',
  async (category) => {
    const group = {
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'system',
      assetContext: 'endpoint',
      memberCount: 0,
      memberVersion: 1,
      revision: 1,
      presentation: { name: 'All managed endpoints', description: 'System scope' },
    }
    const list = vi.fn(async ({ filter }: { filter?: string }) => ({
      items: filter?.includes("kind=='system'") ? [group] : [],
      nextCursor: 'next',
    }))
    const read = vi.fn(async () => ({
      group,
      criteria: null,
      memberSet: null,
      freshness: 'current',
    }))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: GroupsView }],
    })
    await router.push({ path: '/', query: { category } })
    const wrapper = mount(GroupsView, {
      global: {
        plugins: [router, mdmI18n()],
        provide: {
          [mdmKey as symbol]: {
            tenant: 'tenant',
            session: { state: ref({ status: 'authenticated' }) },
            devices: { groups: { list, read }, assets: { catalog: async () => ({ fields: [] }) } },
          },
        },
      },
    })
    try {
      await flushPromises()
      const select = wrapper.findComponent(VSelect)
      expect(select.props('items')).toContainEqual({ value: 'system', title: '系统组' })
      select.vm.$emit('update:modelValue', 'system')
      const form = wrapper.get('form.task-filterbar')
      await form.trigger('submit')
      await flushPromises()
      expect(wrapper.text()).toContain('All managed endpoints')
      expect(list.mock.lastCall?.[0]).toMatchObject({ filter: "(kind=='system')" })
      await form.get('input[type=search]').setValue('managed')
      await form.trigger('submit')
      await flushPromises()
      await form.get('input[type=search]').setValue('draft')
      await wrapper
        .findAll('button')
        .find((b) => b.text() === '下一页')!
        .trigger('click')
      await flushPromises()
      expect(list.mock.lastCall?.[0]).toEqual({
        filter: "(name=icontains='managed');(kind=='system')",
        cursor: 'next',
      })
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'All managed endpoints')!
        .trigger('click')
      await flushPromises()
      expect(read).toHaveBeenCalledWith(group.id)
      for (const label of ['编辑', '重算并发布成员', '删除']) {
        const button = wrapper.findAll('button').find((b) => b.text() === label)
        expect(button, label).toBeDefined()
        expect(button!.attributes()).toHaveProperty('disabled')
      }
    } finally {
      wrapper.unmount()
    }
  },
)
