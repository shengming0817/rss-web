import { ref, nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import { UiDialog } from '@rss/core/components'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import ToolsView from './ToolsView.vue'
import EventBatchesView from './EventBatchesView.vue'
import ManagementActivitiesView from '../../operations/views/ManagementActivitiesView.vue'
import CopyDeepLink from '../../../components/CopyDeepLink.vue'
import PolicyEntry from '../components/PolicyEntry.vue'
import PolicyIdentityEditor from '../components/PolicyIdentityEditor.vue'
import { defaultSchedule } from '../clients/model'
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222'
const policy = {
  id,
  revision: 1,
  version: 1,
  versionId: id,
  state: 'enabled',
  enabled: true,
  definition: {
    alias: 'support',
    customEvent: 'support.event',
    scope: id,
    action: {
      kind: 'execution',
      resource: {
        id: 'script',
        version: '1',
        variant: 'default',
        platform: 'windows',
        architecture: 'x86_64',
      },
      parameters: {},
      schedule: defaultSchedule(),
      frequency: 'every_trigger',
      runLifetimeSeconds: 3600,
    },
  },
}
const capability = {
  id,
  toolName: `policy_${id.replaceAll('-', '')}`,
  alias: 'support',
  instance: id,
  tenant: id,
  revision: 1,
  version: id,
}
const batch = {
  id,
  operationId: id,
  event: 'support.event',
  createdAt: 1,
  deadline: 300,
  members: 1,
  admission: { accepted: 1 },
  request: { source: 'human' },
  processingFailure: null,
}
const member = {
  id,
  policyId: id,
  versionId: other,
  revision: 1,
  state: 'accepted',
  decision: { state: 'accepted', reason: null },
  operations: [{ reference: { kind: 'run', id: other }, state: 'queued' }],
}
const fact = {
  id: 'fact/1',
  source: 'execution',
  kind: 'execution',
  phase: 'received',
  recordedAt: 3,
  observedAt: 2,
  origin: 'human',
  target: { device: 'endpoint', registration: id, generation: 1 },
  links: {
    policy: id,
    version: id,
    batch: id,
    member: null,
    request: id,
    operation: null,
    retirement: null,
    task: other,
    attempt: id,
    steps: ['install'],
    operations: [],
  },
  delivery: 'received',
  execution: 'succeeded',
  effect: 'unknown',
  reporting: 'partial',
  decision: 'accepted',
  auditOutcome: 'committed',
}
function fixture() {
  return {
    tenant: id,
    serviceId: id,
    session: {
      state: ref({
        status: 'authenticated',
        tenant: id,
        identity: { principalId: id },
        session: { id },
      }),
    },
    devices: {
      views: {
        detail: vi
          .fn()
          .mockResolvedValue({
            endpoints: [
              {
                id: 'endpoint',
                displayName: {
                  state: { kind: 'known', value: { kind: 'string', value: 'Support workstation' } },
                },
              },
            ],
            fields: {},
          }),
      },
    },
    policies: {
      policies: {
        list: vi.fn().mockResolvedValue({
          items: [
            {
              ...policy,
              toolName: capability.toolName,
              alias: 'support',
              customEvent: 'support.event',
            },
          ],
          nextCursor: 'YQ',
        }),
        read: vi.fn().mockResolvedValue(policy),
        resolve: vi.fn().mockResolvedValue({ policy, capability }),
      },
      events: {
        list: vi.fn().mockResolvedValue({ items: [batch], nextCursor: 'YQ' }),
        read: vi.fn().mockResolvedValue(batch),
        members: vi.fn().mockResolvedValue({ items: [member], nextCursor: 'YQ' }),
      },
    },
    operations: {
      activities: {
        list: vi.fn().mockResolvedValue({
          items: [fact],
          nextCursor: 'YQ',
          syncCursor: 'Yg',
          asOf: 4,
          retainedFrom: 1,
          coverage: [{ source: 'execution', complete: false, reasons: ['source_catchup_pending'] }],
        }),
        read: vi.fn().mockResolvedValue({
          activity: fact,
          related: [{ ...fact, id: 'fact/2' }],
          missing: ['policy_fact_unavailable'],
          relatedCursor: 'YQ',
        }),
      },
    },
  }
}
async function setup(
  component: Component,
  path = '/endpoint',
  props: Record<string, unknown> = {},
) {
  const runtime = fixture()
  const names = [
    'device-history',
    'device-activities',
    'policy-event-batches',
    'policy-event-batch',
    'policy-tools',
    'policy-events',
    'policy-policies',
    'policy-lifecycle',
    'software-deployments',
    'software-bootstrap',
    'operations-audit',
    'policy-execution',
  ]
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/:device/:batch?', component },
      ...names.map((name) => ({
        path: `/nav/${name}/:tenant?/:device?/:batch?/:execution?/:history?`,
        name,
        component: { template: '<div />' },
      })),
    ],
  })
  await router.push(path)
  const wrapper = mount(component, {
    props,
    global: { plugins: [router, mdmI18n()], provide: { [mdmKey as symbol]: runtime } },
  })
  await flushPromises()
  return { wrapper, runtime, router }
}
function button(wrapper: VueWrapper, text: string) {
  const target = wrapper.findAll('button').find((b) => b.text() === text)
  if (!target) throw new Error(`Missing button ${text}`)
  return target
}
it('edits alias and event without inventing a display-name or executing anything', async () => {
  const { wrapper } = await setup(PolicyIdentityEditor, '/endpoint', {
    alias: null,
    event: null,
    fixedParameters: false,
  })
  await wrapper.get('[data-field=policy-alias]').setValue(' Support ')
  await wrapper.get('[data-field=policy-event]').setValue('refresh')
  expect(wrapper.emitted('update:alias')?.[0]).toEqual([' Support '])
  expect(wrapper.emitted('update:event')?.[0]).toEqual(['refresh'])
  await wrapper.setProps({ event: 'refresh' })
  expect(wrapper.text()).toContain('全部参数固定')
  wrapper.unmount()
})
it('queries event members on the server, preserves applied pagination, and resolves exact aliases', async () => {
  const { wrapper, runtime } = await setup(ToolsView, '/endpoint?event=support.event')
  expect(runtime.policies.policies.list).toHaveBeenCalledWith(
    expect.objectContaining({ filter: "customEvent=='support.event'" }),
  )
  await button(wrapper, '下一页').trigger('click')
  await flushPromises()
  expect(runtime.policies.policies.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ cursor: 'YQ', filter: "customEvent=='support.event'" }),
  )
  await wrapper.get('select').setValue('alias')
  await wrapper.get('input').setValue('support')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(runtime.policies.policies.resolve).toHaveBeenCalledWith({
    kind: 'alias',
    alias: 'support',
  })
  expect(wrapper.text()).toContain('打开所属配置页面')
  runtime.policies.policies.resolve.mockResolvedValueOnce({
    policy,
    capability: { ...capability, tenant: other },
  })
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.find('[data-section=policy-entry]').exists()).toBe(false)
  wrapper.unmount()
})
it('reads stable tool metadata explicitly and discards a late result after session replacement', async () => {
  const { wrapper, runtime } = await setup(PolicyEntry, '/endpoint', { policy })
  expect(runtime.policies.policies.resolve).not.toHaveBeenCalled()
  await button(wrapper, '读取稳定工具名称').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain(capability.toolName)
  let finish: (v: unknown) => void = () => {}
  runtime.policies.policies.resolve.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r
      }),
  )
  await button(wrapper, '读取稳定工具名称').trigger('click')
  runtime.session.state.value.session.id = other
  await nextTick()
  finish({ policy, capability })
  await flushPromises()
  expect(wrapper.text()).not.toContain(capability.toolName)
  wrapper.unmount()
})
it('shows frozen admission separately, follows original owners, and pages batch members', async () => {
  const { wrapper, runtime } = await setup(EventBatchesView, `/endpoint/${id}`)
  expect(wrapper.text()).toContain('Support workstation')
  expect(wrapper.text()).toContain('受理不代表设备完成')
  expect(wrapper.text()).toContain(other)
  expect(wrapper.find('a[href*="policy-execution"]').attributes('href')).toContain(other)
  expect(wrapper.find('a[href*="operations-audit"]').attributes('href')).toContain(id)
  await button(wrapper, '下一页').trigger('click')
  await flushPromises()
  expect(runtime.policies.events.members).toHaveBeenLastCalledWith('endpoint', id, { cursor: 'YQ' })
  wrapper.unmount()
  const list = await setup(EventBatchesView, '/endpoint?event=support.event')
  await button(list.wrapper, '下一页').trigger('click')
  await flushPromises()
  expect(list.runtime.policies.events.list).toHaveBeenLastCalledWith('endpoint', {
    filter: "event=='support.event'",
    cursor: 'YQ',
  })
  list.wrapper.unmount()
})
it('shows partial coverage and independent facts, then clears denied or stale reads', async () => {
  const { wrapper, runtime } = await setup(ManagementActivitiesView, `/endpoint?batch=${id}`)
  expect(runtime.operations.activities.list).toHaveBeenCalledWith('endpoint', { batch: id })
  expect(wrapper.text()).toContain('效果')
  expect(wrapper.text()).toContain('未知')
  expect(wrapper.text()).toContain('部分覆盖')
  expect(wrapper.text()).toContain('Support workstation')
  expect(wrapper.text()).toContain('记录时间（UTC）')
  expect(wrapper.text()).toContain('1970-01-01 00:00:02 UTC')
  await button(wrapper, '查看关联事实').trigger('click')
  await flushPromises()
  expect(runtime.operations.activities.read).toHaveBeenCalledWith('endpoint', fact.id)
  expect(document.body.textContent).toContain('policy_fact_unavailable')
  // Dialog output is teleported; the associated page still owns its lifecycle.
  await wrapper.findComponent(UiDialog).vm.$emit('update:open', false)
  await flushPromises()
  runtime.operations.activities.list.mockRejectedValueOnce(new Error('offline'))
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.find('[data-section=management-activity]').exists()).toBe(false)
  wrapper.unmount()
})
it('offers selectable link text on clipboard failure and never copies invalid locator data', async () => {
  const writeText = vi.fn().mockRejectedValue(new Error('denied'))
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  const target = { kind: 'policy', instance: id, tenant: id, alias: 'support' }
  const { wrapper } = await setup(CopyDeepLink, '/endpoint', { target })
  await button(wrapper, '复制 Deep Link').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('复制失败')
  expect((wrapper.get('input').element as HTMLInputElement).value).toContain(
    'rssmdm://open/v1/policy?',
  )
  writeText.mockResolvedValue(undefined)
  await button(wrapper, '复制 Deep Link').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('链接已复制')
  await wrapper.setProps({ target: { ...target, token: 'secret' } })
  expect(wrapper.find('button').exists()).toBe(false)
  wrapper.unmount()
})
