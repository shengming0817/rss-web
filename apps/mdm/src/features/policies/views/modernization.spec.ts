import { selectControl } from '../vuetify-test-controls'
import { createFeatureRouter as createRouter } from '../../../../tests/feature-router'
import { ref } from 'vue'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { expect, it, vi } from 'vitest'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import ResourcesView from './ResourcesView.vue'
import OperationStages from '../components/OperationStages.vue'

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
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated' }) },
          policies: { resources: { list } },
        },
      },
    },
  })
  await flushPromises()
  expect(wrapper.text()).toContain('Disk inventory')
  expect(wrapper.text()).toContain('unnamed')
  expect(wrapper.text()).toContain('尚无激活版本')
  await selectControl(wrapper, '.task-filterbar select').setValue('configuration')
  await flushPromises()
  expect(list.mock.calls.at(-1)).toEqual([{ filter: "kind=='configuration'", cursor: undefined }])
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '下一页')!
    .trigger('click')
  await flushPromises()
  expect(list.mock.calls.at(-1)).toEqual([{ filter: "kind=='configuration'", cursor: 'next' }])
  list.mockRejectedValueOnce(new Error('directory unavailable'))
  await selectControl(wrapper, '.task-filterbar select').setValue('script')
  await flushPromises()
  expect(wrapper.findAll('button').some((button) => button.text() === '下一页')).toBe(false)
  expect(list.mock.lastCall).toEqual([{ filter: "kind=='script'", cursor: undefined }])
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '新建')!
    .trigger('click')
  await flushPromises()
  const dialog = new DOMWrapper(document.body).get('[role=dialog]')
  await dialog.get('#resource-kind').setValue('software')
  expect(dialog.get('a').attributes('href')).toBe('/imports/tenant')
  expect(dialog.findAll('button').some((button) => button.text() === '保存')).toBe(false)
  wrapper.unmount()
})

it('keeps accepted, queued, unknown device report and unverified effect as independent visible facts', () => {
  const wrapper = mount(OperationStages, {
    attachTo: document.body,
    props: { kind: 'command', dispatch: 'queued', receipt: 'unknown', effect: 'unverified' },
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

it.each([
  {
    kind: 'action_run',
    dispatch: 'claimed',
    receipt: 'succeeded',
    effect: 'verified',
    labels: ['投递已领取', '已验证'],
  },
  {
    kind: 'command',
    dispatch: 'timed_out',
    receipt: 'unknown',
    effect: 'unverified',
    labels: ['已超时', '尚未验证'],
  },
] as const)('uses each formal status domain for $kind', ({ labels, ...props }) => {
  const wrapper = mount(OperationStages, {
    attachTo: document.body,
    props: {
      kind: props.kind,
      dispatch: props.dispatch,
      receipt: props.receipt,
      effect: props.effect,
    },
    global: { plugins: [mdmI18n()] },
  })
  for (const label of labels) expect(wrapper.text()).toContain(label)
  wrapper.unmount()
})

it('keeps Resource creation errors and exact original replay reachable inside the real modal drawer', async () => {
  const change = vi.fn().mockRejectedValueOnce(new Error('lost reply')).mockResolvedValue({})
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ResourcesView }],
  })
  await router.push('/')
  const wrapper = mount(ResourcesView, {
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated' }) },
          policies: {
            resources: {
              list: async () => ({ items: [] }),
              change,
              read: async (id: string) => ({
                id,
                kind: 'script',
                revision: 1,
                presentation: {},
                versions: [],
              }),
            },
          },
        },
      },
    },
  })
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '新建')!
    .trigger('click')
  await flushPromises()
  const dialog = new DOMWrapper(document.body).get('[role=dialog]')
  await dialog
    .findAll('button')
    .find((button) => button.text() === '保存')!
    .trigger('click')
  await flushPromises()
  expect(dialog.get('[role=alert]').text()).toContain('提交结果未知')
  const original = structuredClone(change.mock.calls[0])
  await dialog
    .findAll('button')
    .find((button) => button.text() === '重放同一操作')!
    .trigger('click')
  await flushPromises()
  expect(change.mock.calls[1]).toEqual(original)
  wrapper.unmount()
})
