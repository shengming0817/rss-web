import { createFeatureRouter as createRouter } from '../../../../tests/feature-router'
import { defineComponent, ref, type Component } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { expect, it, vi } from 'vitest'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import { defaultSchedule, type PolicyChange, type PolicyRead } from '../clients/model'
import type { Operation } from '../../../services/useOperation'
import PoliciesView from './PoliciesView.vue'
import DeploymentsView from '../../software/views/DeploymentsView.vue'
import BootstrapView from '../../software/views/BootstrapView.vue'
import PolicyDelete from '../components/PolicyDelete.vue'

const id = '11111111-1111-4111-8111-111111111111'
const dialog = defineComponent({
  props: { open: Boolean, description: String },
  template:
    '<section v-if="open" role="alertdialog"><p>{{ description }}</p><slot /><slot name="footer" /></section>',
})
const scenarios = [
  {
    name: 'ordinary Policy',
    component: PoliciesView,
    action: {
      kind: 'execution',
      resource: {
        id: 'script',
        version: '1',
        platform: 'windows',
        architecture: 'x86_64',
        variant: 'default',
      },
      parameters: {},
      schedule: defaultSchedule(),
      frequency: 'once_per_version',
      runLifetimeSeconds: 600,
    },
  },
  {
    name: 'software deployment',
    component: DeploymentsView,
    action: {
      kind: 'software',
      resource: { kind: 'software', id: 'app', version: '1', variants: { windows_x86_64: 'main' } },
      channel: 'agent',
      delivery: { kind: 'direct' },
      intent: 'required_install',
      schedule: defaultSchedule(),
      runLifetimeSeconds: 600,
      rollout: { stages: [{ scope: id, opensAt: 0, minimumVerifiedPercent: null }] },
    },
  },
  {
    name: 'channel onboarding',
    component: BootstrapView,
    action: {
      kind: 'request_mdm_enrollment',
      organization: id,
      schedule: defaultSchedule(),
      runLifetimeSeconds: 600,
    },
  },
]
async function fixture(
  component: Component,
  action: unknown,
  state: PolicyRead['state'] = 'disabled',
  initialRead?: Promise<PolicyRead>,
) {
  let policy = {
    id,
    revision: 1,
    version: 1,
    versionId: id,
    state,
    enabled: state === 'enabled',
    definition: { customEvent: 'refresh.policy', alias: null, scope: id, action },
  } as PolicyRead
  const read = vi.fn(async () => initialRead ?? structuredClone(policy))
  const change = vi.fn(async (_id: string, body: Operation<PolicyChange>) => {
    const state =
      body.input.action === 'archive'
        ? 'archived'
        : body.input.action === 'enable'
          ? 'enabled'
          : 'disabled'
    policy = { ...policy, state, enabled: state === 'enabled', revision: policy.revision + 1 }
    return structuredClone(policy)
  })
  const session = ref({
    status: 'authenticated',
    tenant: id,
    identity: { principalId: id },
    session: { id },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component },
      { path: '/lifecycle', name: 'policy-lifecycle', component: { template: '<div />' } },
    ],
  })
  await router.push({ path: '/', query: { id } })
  const wrapper = mount(component, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: {
        UiDialog: dialog,
        ResourceIdentity: true,
        SelfServiceEditor: true,
        CatalogLocator: true,
        NativeScheduleEditor: true,
      },
      provide: {
        [mdmKey as symbol]: {
          tenant: id,
          session: { state: session },
          policies: {
            policies: {
              read,
              change,
              list: vi.fn(async () => ({ items: [structuredClone(policy)], nextCursor: null })),
            },
          },
        },
      },
    },
  })
  await flushPromises()
  const button = (text: string) => wrapper.findAll('button').find((b) => b.text() === text)!
  async function confirmDelete() {
    await wrapper.get('[data-action="delete-policy"]').trigger('click')
    await wrapper.get('[role="alertdialog"] button').trigger('click')
    await flushPromises()
  }
  return { wrapper, change, read, button, confirmDelete, router, session }
}
for (const scenario of scenarios) {
  it(`${scenario.name}: keeps a directly opened archived Policy read-only`, async () => {
    const f = await fixture(scenario.component, scenario.action, 'archived')
    expect(f.wrapper.text()).toContain('已归档')
    expect(f.wrapper.text()).toContain('仅供查看')
    expect(f.wrapper.find('[data-action="delete-policy"]').exists()).toBe(false)
    expect(
      f.wrapper.findAll('button').some((b) => ['编辑', '启用', '恢复'].includes(b.text())),
    ).toBe(false)
    if (scenario.component === PoliciesView) {
      expect(f.wrapper.get('form > fieldset').attributes('disabled')).toBeDefined()
      await f.wrapper.get('form').trigger('submit')
    } else if (scenario.component === DeploymentsView)
      expect(f.wrapper.get('form').isVisible()).toBe(false)
    else expect(f.wrapper.find('form').exists()).toBe(false)
    expect(f.change).not.toHaveBeenCalled()
    f.wrapper.unmount()
  })
  it(`${scenario.name}: requires a separate disable before confirming deletion`, async () => {
    const f = await fixture(scenario.component, scenario.action, 'enabled')
    expect(f.wrapper.get('[data-action="delete-policy"]').attributes('disabled')).toBeDefined()
    expect(f.wrapper.text()).toContain('请先停用')
    await f
      .button(
        scenario.component === DeploymentsView
          ? '暂停整个策略'
          : scenario.component === PoliciesView
            ? '禁用整个 Policy'
            : '停用',
      )
      .trigger('click')
    await flushPromises()
    expect(f.change).toHaveBeenCalledTimes(1)
    expect(f.change.mock.calls[0]![1]).toMatchObject({
      input: { action: 'disable' },
      expectedRevision: 1,
    })
    await f.confirmDelete()
    expect(f.change).toHaveBeenCalledTimes(2)
    expect(f.change.mock.calls[1]![1]).toMatchObject({
      input: { action: 'archive' },
      expectedRevision: 2,
    })
    expect(f.wrapper.find('[data-action="delete-policy"]').exists()).toBe(false)
    expect(f.wrapper.findAll('li button').some((b) => b.text().includes(id))).toBe(false)
    f.wrapper.unmount()
  })
  it(`${scenario.name}: retries an unknown deletion only explicitly and with the original operation`, async () => {
    const f = await fixture(scenario.component, scenario.action)
    f.change.mockRejectedValueOnce(new Error('lost committed response'))
    await f.confirmDelete()
    expect(f.change).toHaveBeenCalledTimes(1)
    const original = structuredClone(f.change.mock.calls[0])
    expect(f.wrapper.get('[data-action="delete-policy"]').attributes('disabled')).toBeDefined()
    const recovery = scenario.component === DeploymentsView ? '重放同一操作' : '核对／重试原提交'
    await f.button(recovery).trigger('click')
    await flushPromises()
    expect(f.change.mock.calls[1]).toEqual(original)
    expect(f.wrapper.text()).toContain('已归档')
    expect(f.wrapper.findAll('li button').some((b) => b.text().includes(id))).toBe(false)
    f.wrapper.unmount()
  })
  it(`${scenario.name}: discards a read issued by the previous identity`, async () => {
    let complete!: (p: PolicyRead) => void
    const response = new Promise<PolicyRead>((resolve) => {
      complete = resolve
    })
    const f = await fixture(scenario.component, scenario.action, 'disabled', response)
    f.session.value = { ...f.session.value, identity: { principalId: crypto.randomUUID() } }
    await flushPromises()
    complete({
      id,
      revision: 1,
      version: 1,
      versionId: id,
      state: 'disabled',
      enabled: false,
      definition: { customEvent: null, alias: null, scope: id, action: scenario.action },
    } as PolicyRead)
    await flushPromises()
    expect(f.wrapper.findComponent(PolicyDelete).exists()).toBe(false)
    expect(f.button('新建').attributes('disabled')).toBeUndefined()
    f.wrapper.unmount()
  })
  it(`${scenario.name}: ignores a late unknown deletion after the session changes`, async () => {
    const f = await fixture(scenario.component, scenario.action)
    let reject!: (error: Error) => void
    f.change.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
    await f.confirmDelete()
    f.session.value = { ...f.session.value, session: { id: crypto.randomUUID() } }
    await flushPromises()
    reject(new Error('response lost'))
    await flushPromises()
    expect(f.wrapper.findComponent(PolicyDelete).exists()).toBe(false)
    expect(f.button('新建').attributes('disabled')).toBeUndefined()
    expect(f.change).toHaveBeenCalledTimes(1)
    f.wrapper.unmount()
  })
}
it('invalidates a deletion confirmation when its Policy revision or target changes', async () => {
  const f = await fixture(PoliciesView, scenarios[0]!.action)
  await f.wrapper.get('[data-action="delete-policy"]').trigger('click')
  expect(f.wrapper.find('[role="alertdialog"]').exists()).toBe(true)
  f.read.mockResolvedValueOnce({ ...(await f.read.mock.results[0]!.value), revision: 2 })
  await f.button('重新载入配置（替换编辑）').trigger('click')
  await flushPromises()
  expect(f.wrapper.find('[role="alertdialog"]').exists()).toBe(false)
  await f.wrapper.get('[data-action="delete-policy"]').trigger('click')
  await f.router.push({ query: { id: crypto.randomUUID() } })
  await flushPromises()
  expect(f.wrapper.find('[role="alertdialog"]').exists()).toBe(false)
  expect(f.change).not.toHaveBeenCalled()
  f.wrapper.unmount()
})
it.each(['remove', 'retain'] as const)(
  'shows the configured %s exit behavior before deletion',
  async (exit) => {
    const policy = {
      id,
      revision: 2,
      state: 'disabled',
      enabled: false,
      definition: {
        customEvent: null,
        alias: null,
        scope: id,
        action: {
          kind: 'configuration',
          resource: {
            id: 'camera',
            version: '1',
            platform: 'windows',
            architecture: 'x86_64',
            variant: 'default',
          },
          exit,
        },
      },
    } as PolicyRead
    const wrapper = mount(PolicyDelete, {
      props: { policy, disabled: false },
      global: { plugins: [mdmI18n()], stubs: { UiDialog: dialog } },
    })
    await wrapper.get('[data-action="delete-policy"]').trigger('click')
    expect(wrapper.get('[role="alertdialog"]').text()).toContain(
      exit === 'remove' ? '最后一个分配退出后按资源移除配置' : '保留配置效果',
    )
    wrapper.unmount()
  },
)

it('preserves an existing enrollment custom event while saving an ordinary schedule edit', async () => {
  const scenario = scenarios[2]!
  const f = await fixture(BootstrapView, scenario.action)
  await f.button('编辑').trigger('click')
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(f.change.mock.calls[0]?.[1].input).toMatchObject({
    action: 'put',
    definition: { customEvent: 'refresh.policy' },
  })
  f.wrapper.unmount()
})
