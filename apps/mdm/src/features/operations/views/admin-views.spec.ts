import { expect, it } from 'vitest'
import type { Component } from 'vue'
import { createSoftwareClients } from '../../software/client'
import { createPolicyClients } from '../../policies/client'
import AlertRulesView from './AlertRulesView.vue'
import ApprovalsView from './ApprovalsView.vue'
import AuditView from './AuditView.vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { decodeMdmError } from '@rss/api/mdm'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import { createOperationsClients } from '../client'
import { createScenario, TENANT } from '../../../../demo/scenario'
import { createAutomationDemo } from '../../../../demo/policies/state'
import { createDeviceDemo } from '../../../../demo/devices/state'
import OrganizationView from './OrganizationView.vue'
import AuthorizationView from './AuthorizationView.vue'
import ReportsView from './ReportsView.vue'
import IntegrationsView from './IntegrationsView.vue'
import SettingsView from './SettingsView.vue'
async function fixture(component: Component) {
  const devices = createDeviceDemo(),
    automation = createAutomationDemo(devices),
    server = createScenario(
      [automation.handle, devices.handle],
      automation.reset,
      automation.tick,
      automation.observe,
      automation.now,
    )
  const login = await server.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const headers = {
    'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
    'x-identity-request': '1',
  }
  const transport = {
    request: async (o: RequestOptions<unknown>) => {
      const path = o.path.replace(/\{([^}]+)\}/g, (_, key: string) => String(o.pathParams![key]))
      const q = new URLSearchParams()
      for (const [k, v] of Object.entries(o.query ?? {})) if (v !== undefined) q.set(k, String(v))
      const reply = await server.handle(o.method, `${path}?${q}`, o.body, headers)
      if (reply.status >= 400) throw decodeMdmError(reply.status, reply.body)
      return o.decode(reply.body)
    },
  } as HttpTransport
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component },
      { path: '/next', component },
    ],
  })
  await router.push('/')
  const clients = createOperationsClients(transport, TENANT, true)
  const wrapper = mount(component, {
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: TENANT,
          demo: true,
          operations: clients,
          software: createSoftwareClients(transport, TENANT, true),
          policies: createPolicyClients(transport, TENANT, true),
        },
      },
    },
  })
  await flushPromises()
  return { wrapper, server, clients, automation, router }
}
it('manages all group members and preserves a draft on conflict', async () => {
  const f = await fixture(OrganizationView)
  await f.wrapper.get('[data-testid="group-name"]').setValue('Operators')
  await f.wrapper
    .get('[data-testid="group-member"]')
    .setValue('33333333-3333-4333-8333-333333333333')
  await f.wrapper.get('[data-testid="add-member"]').trigger('click')
  await f.wrapper.get('[data-testid="save-group"]').trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain('Operators')
  f.server.set('conflict')
  await f.wrapper.get('[data-testid="group-name"]').setValue('Draft')
  await f.wrapper.get('[data-testid="save-group"]').trigger('click')
  await flushPromises()
  expect((f.wrapper.get('[data-testid="group-name"]').element as HTMLInputElement).value).toBe(
    'Draft',
  )
  f.wrapper.unmount()
})
it('creates native grants and explains server-provided effective authority', async () => {
  const f = await fixture(AuthorizationView)
  expect(f.wrapper.text()).toContain('authorization_read')
  await f.wrapper.get('[data-testid="subject-id"]').setValue('33333333-3333-4333-8333-333333333333')
  await f.wrapper.get('[data-testid="save-rule"]').trigger('click')
  await flushPromises()
  expect(f.wrapper.find('[role="alert"]').exists()).toBe(false)
  f.wrapper.unmount()
})
it('renders partial metrics and explicit report acceptance without fabricated completion', async () => {
  const f = await fixture(ReportsView)
  f.server.set('partial')
  await f.wrapper.get('[data-testid="refresh-metrics"]').trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain('部分')
  await f.wrapper.get('[data-testid="run-report"]').trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain('accepted')
  f.wrapper.unmount()
})
it('keeps unknown connector writes locked until exact replay', async () => {
  const f = await fixture(IntegrationsView)
  await f.wrapper.get('[data-testid="connector-name"]').setValue('Service desk')
  await f.wrapper
    .get('[data-testid="connector-endpoint"]')
    .setValue('https://itsm.example.test/events')
  f.server.set('unknown')
  await f.wrapper.get('[data-testid="save-connector"]').trigger('click')
  await flushPromises()
  expect(f.wrapper.get('[data-testid="save-connector"]').element.matches(':disabled')).toBe(true)
  f.server.set('normal')
  await f.wrapper.get('[data-testid="replay-write"]').trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain('Service desk')
  f.wrapper.unmount()
})
it('separates saved and active configuration and maintenance effect facts', async () => {
  const f = await fixture(SettingsView)
  await f.wrapper.get('[data-testid="configuration-name"]').setValue('Updated')
  await f.wrapper.get('[data-testid="save-configuration"]').trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain('saved')
  await f.wrapper.get('[data-testid="activate-configuration"]').trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain('restart_required')
  await f.wrapper.get('[data-testid="start-maintenance"]').trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain('unknown')
  f.wrapper.unmount()
})

it('saves and edits alert rules through the same HTTP owner', async () => {
  const f = await fixture(AlertRulesView)
  await f.wrapper.get('[data-testid="alert-rule-name"]').setValue('Queue monitor')
  await f.wrapper.get('[data-testid="save-alert-rule"]').trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain('Queue monitor')
  const buttons = f.wrapper.findAll('button')
  await buttons.find((b) => b.text().includes('Queue monitor'))!.trigger('click')
  await flushPromises()
  await f.wrapper.get('[data-testid="alert-rule-name"]').setValue('Updated queue monitor')
  await f.wrapper.get('[data-testid="save-alert-rule"]').trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain('Updated queue monitor')
  f.wrapper.unmount()
})
it('uses original software and workflow queues for approvals', async () => {
  const f = await fixture(ApprovalsView)
  expect(f.wrapper.text()).toContain('软件自助申请')
  expect(f.wrapper.text()).toContain('工作流审批')
  expect(f.wrapper.find('[role="alert"]').exists()).toBe(false)
  await f.wrapper.findAll('button')[0]!.trigger('click')
  await flushPromises()
  f.wrapper.unmount()
})
it('filters Identity security separately and opens an authorized audit detail', async () => {
  const f = await fixture(AuditView)
  const select = f.wrapper.findAll('select').find((s) => s.text().includes('identity_security'))!
  await select.setValue('identity_security')
  await f.wrapper.get('[data-testid="audit-filter"]').trigger('submit')
  await flushPromises()
  expect(f.wrapper.text()).toContain('Identity 会话创建')
  await f.wrapper.findAll('tbody button')[0]!.trigger('click')
  await flushPromises()
  expect(f.wrapper.get('[data-testid="audit-detail"]').text()).toContain(
    'identity_security / request / HTTP 200',
  )
  f.wrapper.unmount()
})
it('compares native membership without replacing drafts and only adopts revision explicitly', async () => {
  const f = await fixture(OrganizationView)
  await f.wrapper.get('[data-testid="group-name"]').setValue('Initial')
  await f.wrapper.get('[data-testid="save-group"]').trigger('click')
  await flushPromises()
  const group = (await f.clients.authorization.groups()).items[0]!
  await f.wrapper
    .findAll('button')
    .find((b) => b.text().includes('Initial'))!
    .trigger('click')
  await flushPromises()
  await f.clients.authorization.changeGroup(group.id, {
    operationId: crypto.randomUUID(),
    expectedRevision: group.revision,
    value: { name: 'Server update', enabled: true, members: [] },
  })
  await f.wrapper.get('[data-testid="group-name"]').setValue('My draft')
  await f.wrapper.get('[data-testid="save-group"]').trigger('click')
  await flushPromises()
  expect(f.wrapper.get('[data-testid="save-group"]').element.matches(':disabled')).toBe(true)
  await f.wrapper
    .findAll('button')
    .find((b) => b.text() === '读取服务器版本并比较')!
    .trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain('Server update')
  expect((f.wrapper.get('[data-testid="group-name"]').element as HTMLInputElement).value).toBe(
    'My draft',
  )
  await f.wrapper
    .findAll('button')
    .find((b) => b.text() === '保留草稿，采用当前 revision')!
    .trigger('click')
  await f.wrapper.get('[data-testid="save-group"]').trigger('click')
  await flushPromises()
  expect((await f.clients.authorization.groups()).items[0]!.value!.name).toBe('My draft')
  f.wrapper.unmount()
})
