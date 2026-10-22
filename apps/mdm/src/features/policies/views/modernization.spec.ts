import { ref } from 'vue'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { expect, it, vi } from 'vitest'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import GroupsView from '../../devices/views/GroupsView.vue'
import ResourcesView from './ResourcesView.vue'
import OperationStages from '../components/OperationStages.vue'

it('queries authorized groups by name and type and keeps the applied query when paging', async () => {
  const list = vi.fn().mockResolvedValue({ items: [], nextCursor: 'next' })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: GroupsView }],
  })
  await router.push('/')
  const wrapper = mount(GroupsView, {
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
  const filter = wrapper.get('form.task-filterbar')
  await filter.get('input[type=search]').setValue('macOS')
  await filter.get('select').setValue('dynamic')
  await filter.trigger('submit')
  await flushPromises()
  expect(list.mock.calls.at(-1)?.[0]).toEqual({ name: 'macOS', kind: 'dynamic', after: undefined })
  await filter.get('input[type=search]').setValue('unsaved draft')
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '下一页')!
    .trigger('click')
  await flushPromises()
  expect(list.mock.calls.at(-1)?.[0]).toEqual({ name: 'macOS', kind: 'dynamic', after: 'next' })
  await filter.get('input[type=search]').trigger('keydown', { key: 'Enter' })
  await flushPromises()
  expect(list.mock.calls.at(-1)?.[0]).toEqual({
    name: 'unsaved draft',
    kind: 'dynamic',
    after: undefined,
  })
  wrapper.unmount()
})

it('filters Resource kinds through the formal directory and opens software import from the creation drawer', async () => {
  const list = vi.fn().mockResolvedValue({
    items: [
      {
        id: 'named',
        presentation: { name: 'Disk inventory', description: 'Read existing assets' },
        kind: 'script',
        activeVersion: 'v2',
        revision: 3,
      },
      { id: 'unnamed', presentation: {}, kind: 'configuration', activeVersion: null, revision: 1 },
    ],
    nextCursor: 'next',
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: ResourcesView },
      {
        path: '/imports/:tenant',
        name: 'software-imports',
        component: { template: '<p>imports</p>' },
      },
    ],
  })
  await router.push('/')
  const wrapper = mount(ResourcesView, {
    global: {
      plugins: [router, mdmI18n()],
      provide: {
        [mdmKey as symbol]: { tenant: 'tenant', policies: { resources: { list } } },
      },
    },
  })
  await flushPromises()
  expect(wrapper.text()).toContain('Disk inventory')
  expect(wrapper.text()).toContain('unnamed')
  expect(wrapper.text()).toContain('尚无激活版本')
  await wrapper.get('.task-filterbar select').setValue('configuration')
  await flushPromises()
  expect(list.mock.calls.at(-1)).toEqual(['configuration', undefined])
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '下一页')!
    .trigger('click')
  await flushPromises()
  expect(list.mock.calls.at(-1)).toEqual(['configuration', 'next'])
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '新建')!
    .trigger('click')
  await flushPromises()
  const dialog = new DOMWrapper(document.body).get('[role=dialog]')
  await dialog.get('#resource-kind').setValue('software')
  expect(dialog.get('a').attributes('href')).toBe('/imports/tenant')
  expect(dialog.findAll('button').some((button) => button.text() === '保存版本')).toBe(false)
  wrapper.unmount()
})

it('keeps accepted, queued, unknown device report and unverified effect as independent visible facts', () => {
  const wrapper = mount(OperationStages, {
    props: { dispatch: 'queued', receipt: 'unknown', effect: 'unverified' },
    global: { plugins: [mdmI18n()] },
  })
  const stages = wrapper.findAll('dl > div')
  expect(stages).toHaveLength(4)
  expect(stages[0]!.text()).toContain('已受理')
  expect(stages[1]!.text()).toContain('排队中')
  expect(stages[2]!.text()).toContain('未知')
  expect(stages[3]!.text()).toContain('尚未验证')
  expect(wrapper.text()).not.toContain('执行成功')
  wrapper.unmount()
})
