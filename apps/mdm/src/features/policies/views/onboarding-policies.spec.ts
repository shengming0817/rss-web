import { createFeatureRouter as createRouter } from '../../../../tests/feature-router'
import { flushPromises, mount, DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { ref, type Component } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { expect, it, vi } from 'vitest'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import { defaultSchedule } from '../clients/model'
import { selectControl, hasChoice } from '../vuetify-test-controls'
import BootstrapView from './OnboardingPoliciesView.vue'
import ResourcesView from './ResourcesView.vue'
const id = '11111111-1111-4111-8111-111111111111'
async function fixture(component: Component, owners: object) {
  const session = ref({
    status: 'authenticated',
    tenant: id,
    identity: { principalId: id },
    session: { id },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component }],
  })
  await router.push('/')
  const wrapper = mount(component, {
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true, CatalogLocator: true },
      provide: { [mdmKey as symbol]: { tenant: id, session: { state: session }, ...owners } },
    },
  })
  await flushPromises()
  return { wrapper }
}
const button = (w: VueWrapper, label: string) =>
  w.findAll('button').find((b) => b.text() === label)!
it('saves onboarding as the shared Policy and reads the formal execution directory', async () => {
  const change = vi.fn(async (id, body) => ({
      id,
      revision: 1,
      enabled: true,
      definition: body.input.definition,
    })),
    list = vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    directory = vi
      .fn()
      .mockResolvedValue({ items: [], nextCursor: null, statistics: { total: 0 }, asOf: 1 })
  const { wrapper } = await fixture(BootstrapView, {
    policies: { policies: { list, change }, executions: { directory } },
  })
  await selectControl(wrapper).setValue('request_mdm_enrollment')
  await button(wrapper, '新建').trigger('click')
  await flushPromises()
  await wrapper.get('#onboarding-scope').setValue(id)
  await wrapper.get('#onboarding-organization').setValue(id)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(change.mock.calls[0]?.[1].input.definition).toEqual({
    customEvent: null,
    scope: id,
    alias: null,
    action: {
      kind: 'request_mdm_enrollment',
      organization: id,
      schedule: defaultSchedule(),
      runLifetimeSeconds: 1800,
    },
  })
  await button(wrapper, '执行中心').trigger('click')
  await flushPromises()
  expect(directory.mock.calls[0]?.[0].filter).toContain(change.mock.calls[0]?.[0])
  wrapper.unmount()
})

it('binds explicit Agent releases in the common Policy and reads canonical registration progress', async () => {
  const targets = ['windows_x86_64', 'windows_aarch64', 'macos_x86_64', 'macos_aarch64']
  const releases = targets.map((target, i) => ({
    releaseId: `11111111-1111-4111-8111-${String(i + 1).padStart(12, '0')}`,
    target: {
      platform: target.split('_')[0],
      architecture: target.startsWith('windows') ? target.slice(8) : target.slice(6),
    },
    version: '1',
    format: target.startsWith('windows') ? 'exe' : 'pkg',
  }))
  let saved: { id: string; revision: number; enabled: boolean; definition: unknown } | undefined
  const change = vi.fn(async (id, body) => {
    saved = {
      id,
      revision: (saved?.revision ?? 0) + 1,
      enabled: body.input.action === 'put' ? body.input.enabled : body.input.action === 'enable',
      definition: body.input.definition ?? saved?.definition,
    }
    return saved
  })
  const assignments = vi.fn().mockResolvedValue({
    items: [
      {
        object: { kind: 'endpoint', id: 'endpoint' },
        channel: 'mdm',
        availability: 'ready',
        reason: null,
        target: { device: 'endpoint', channel: 'mdm', registrationId: id, generation: 2 },
        qualification: { state: 'eligible', entry: 1 },
        operationIds: [],
        sources: [],
      },
    ],
    nextCursor: null,
  })
  const directory = vi
    .fn()
    .mockResolvedValue({ items: [], statistics: { total: 0 }, asOf: 1, nextCursor: null })
  const { wrapper } = await fixture(BootstrapView, {
    onboarding: { packages: { list: vi.fn().mockResolvedValue(releases) } },
    policies: {
      policies: {
        list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
        change,
        assignments,
      },
      executions: { directory },
    },
  })
  await button(wrapper, '新建').trigger('click')
  await flushPromises()
  await wrapper.get('#onboarding-scope').setValue(id)
  await button(wrapper, '读取 Agent 发行包').trigger('click')
  await flushPromises()
  const selectors = wrapper
    .get('form')
    .findAllComponents({ name: 'VSelect' })
    .filter((s: VueWrapper) => hasChoice(s, ''))
  for (let i = 0; i < 4; i++) await selectors[i]!.setValue(releases[i]!.releaseId)
  const lifetime = wrapper.get('form input[max="604800"]')
  await lifetime.setValue(3600)
  await wrapper.get('form').findAll('input[type=checkbox]').at(-1)!.setValue(false)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(change.mock.calls[0]?.[1]).toMatchObject({
    input: {
      enabled: false,
      definition: {
        action: {
          kind: 'ensure_agent_installed',
          packages: Object.fromEntries(
            targets.map((target, i) => [target, releases[i]!.releaseId]),
          ),
          runLifetimeSeconds: 3600,
        },
      },
    },
  })
  await button(wrapper, '启用').trigger('click')
  await flushPromises()
  expect(change.mock.calls[1]?.[1]).toMatchObject({
    expectedRevision: 1,
    input: { action: 'enable' },
  })
  await button(wrapper, '刷新进度（保留编辑）').trigger('click')
  await flushPromises()
  await button(wrapper, '来源与历史证据').trigger('click')
  await flushPromises()
  expect(new DOMWrapper(document.body).get('[role=dialog]').text()).toContain(id)
  expect(new DOMWrapper(document.body).get('[role=dialog]').text()).toContain('2')
  await button(wrapper, '执行中心').trigger('click')
  await flushPromises()
  expect(directory.mock.calls[0]?.[0].filter).toContain(saved?.id)
  wrapper.unmount()
})

it('instantiates the selected update blueprint through the unified Resource library', async () => {
  const blueprint = {
    id: 'update-state',
    version: '1',
    category: 'updates',
    platform: 'windows',
    definition: { kind: 'native_collection' },
  }
  const blueprints = vi
    .fn()
    .mockResolvedValue({
      categories: ['updates', 'hardware'],
      items: [blueprint, { ...blueprint, id: 'hardware', category: 'hardware' }],
    })
  const change = vi.fn().mockResolvedValue({}),
    read = vi.fn(async (id: string) => ({
      id,
      revision: 1,
      kind: 'native_collection',
      presentation: {},
      versions: [],
    }))
  const { wrapper } = await fixture(ResourcesView, {
    policies: {
      resources: { list: async () => ({ items: [], nextCursor: null }), blueprints, change, read },
    },
  })
  await button(wrapper, '新建').trigger('click')
  await button(wrapper, '选择标准采集包').trigger('click')
  await flushPromises()
  const selectors = wrapper.findAllComponents({ name: 'VSelect' })
  await selectors.find((control: VueWrapper) => hasChoice(control, 'updates'))!.setValue('updates')
  const choice = selectors.find((control: VueWrapper) =>
    hasChoice(control, JSON.stringify(['update-state', '1'])),
  )!
  expect(hasChoice(choice, JSON.stringify(['hardware', '1']))).toBe(false)
  await choice.setValue(JSON.stringify(['update-state', '1']))
  await button(wrapper, '创建标准采集资源').trigger('click')
  await flushPromises()
  expect(change.mock.calls[0]?.[1]).toMatchObject({
    expectedRevision: 0,
    input: { action: 'instantiate', blueprint: 'update-state', version: '1' },
  })
  expect(read).toHaveBeenCalledWith(change.mock.calls[0]?.[0])
  wrapper.unmount()
})
