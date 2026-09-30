import { expect, it } from 'vitest'
import type { Component } from 'vue'
import { createSoftwareClients } from '../../software/client'
import { createPolicyClients } from '../../policies/client'
import AlertRulesView from './AlertRulesView.vue'
import ApprovalsView from './ApprovalsView.vue'
import AuditView from './AuditView.vue'
import AlertsView from './AlertsView.vue'
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
  let inspect: ((o: RequestOptions<unknown>) => void | Promise<void>) | undefined
  const transport = {
    request: async (o: RequestOptions<unknown>) => {
      await inspect?.(o)
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
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
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
  return {
    wrapper,
    server,
    clients,
    automation,
    router,
    inspect: (f: (o: RequestOptions<unknown>) => void | Promise<void>) => {
      inspect = f
    },
  }
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

it('discards incomplete membership after a second-page conflict and edits the fully reloaded revision', async () => {
  const f = await fixture(OrganizationView),
    id = crypto.randomUUID(),
    effective = await f.clients.authorization.effective()
  const members = Array.from({ length: 201 }, (_, i) => ({
    instanceId: effective.instanceId,
    tenantId: TENANT,
    principalId: `99999999-9999-4999-8999-${String(i + 1).padStart(12, '0')}`,
  }))
  await f.clients.authorization.changeGroup(id, {
    operationId: crypto.randomUUID(),
    expectedRevision: 0,
    value: { name: 'Large group', enabled: true, members },
  })
  await f.wrapper
    .findAll('button')
    .find((b) => b.text() === '重新读取')!
    .trigger('click')
  await flushPromises()
  let changed = false
  const added = { ...members[0]!, principalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
  f.inspect(async (o) => {
    if (!changed && o.path.endsWith('/members') && o.query?.['offset'] === 100) {
      changed = true
      await f.clients.authorization.changeGroup(id, {
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
        value: { name: 'Concurrent group', enabled: true, members: [...members, added] },
      })
    }
  })
  await f.wrapper
    .findAll('button')
    .find((b) => b.text().includes('Large group'))!
    .trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain(added.principalId)
  expect(f.wrapper.find('[role="alert"]').exists()).toBe(false)
  await f.wrapper.get('[data-testid="group-name"]').setValue('Safely edited')
  await f.wrapper.get('[data-testid="save-group"]').trigger('click')
  await flushPromises()
  expect(await f.clients.authorization.allMembers(id, 3)).toEqual([...members, added])
  f.wrapper.unmount()
})
it('reconciles completed reports after unknown accepted receipts are replayed', async () => {
  const f = await fixture(ReportsView)
  f.server.set('unknown')
  await f.wrapper.get('[data-testid="run-report"]').trigger('click')
  await flushPromises()
  f.automation.tick({ kind: 'clock', at: f.automation.now() + 100 }, 'normal')
  f.server.set('normal')
  await f.wrapper.get('[data-testid="replay-write"]').trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain('completed')
  f.wrapper.unmount()
})
it('reconciles active configuration and completed maintenance after unknown replay', async () => {
  const f = await fixture(SettingsView)
  await f.wrapper.get('[data-testid="save-configuration"]').trigger('click')
  await flushPromises()
  f.server.set('unknown')
  await f.wrapper.get('[data-testid="activate-configuration"]').trigger('click')
  await flushPromises()
  f.automation.tick({ kind: 'clock', at: f.automation.now() + 100 }, 'normal')
  f.server.set('normal')
  await f.wrapper.get('[data-testid="replay-write"]').trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).not.toContain('restart_required')
  expect(f.wrapper.text()).toContain('active')
  f.server.set('unknown')
  await f.wrapper.get('[data-testid="start-maintenance"]').trigger('click')
  await flushPromises()
  f.automation.tick({ kind: 'clock', at: f.automation.now() + 100 }, 'normal')
  f.server.set('normal')
  await f.wrapper.get('[data-testid="replay-write"]').trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain('completed')
  expect(f.wrapper.text()).toContain('unverified')
  expect(f.wrapper.findAll('button').some((b) => b.text() === '暂停')).toBe(false)
  f.wrapper.unmount()
})
it('opens group/report/job links and follows target query changes', async () => {
  const group = await fixture(OrganizationView),
    id = crypto.randomUUID(),
    other = crypto.randomUUID()
  for (const [target, name] of [
    [id, 'Linked group'],
    [other, 'Second linked group'],
  ])
    await group.clients.authorization.changeGroup(target!, {
      operationId: crypto.randomUUID(),
      expectedRevision: 0,
      value: { name: name!, enabled: true, members: [] },
    })
  await group.router.push({ path: '/', query: { id } })
  await flushPromises()
  expect((group.wrapper.get('[data-testid="group-name"]').element as HTMLInputElement).value).toBe(
    'Linked group',
  )
  await group.router.push({ path: '/', query: { id: other } })
  await flushPromises()
  expect((group.wrapper.get('[data-testid="group-name"]').element as HTMLInputElement).value).toBe(
    'Second linked group',
  )
  group.wrapper.unmount()
  const report = await fixture(ReportsView),
    r = await report.clients.admin.reports.run({
      operationId: crypto.randomUUID(),
      expectedRevision: 0,
      input: { from: 0, until: report.automation.now() },
    })
  await report.router.push({ path: '/', query: { id: r.id } })
  await flushPromises()
  expect(report.wrapper.text()).toContain(r.id)
  report.wrapper.unmount()
  const settings = await fixture(SettingsView),
    job = await settings.clients.admin.maintenance.start({
      operationId: crypto.randomUUID(),
      expectedRevision: 0,
      input: { kind: 'backup', target: 'linked-backup', method: 'full' },
    })
  await settings.router.push({ path: '/', query: { id: job.id } })
  await flushPromises()
  expect(settings.wrapper.text()).toContain('linked-backup')
  settings.wrapper.unmount()
})
it('locates a native rule beyond page one and reports missing/tombstone targets', async () => {
  const f = await fixture(AuthorizationView),
    e = await f.clients.authorization.effective()
  let last = ''
  for (let i = 1; i <= 101; i++) {
    last = `99999999-9999-4999-8999-${String(i).padStart(12, '0')}`
    await f.clients.authorization.changeRule(last, {
      operationId: crypto.randomUUID(),
      expectedRevision: 0,
      value: {
        subject: {
          kind: 'user',
          user: { instanceId: e.instanceId, tenantId: TENANT, principalId: e.principalId },
        },
        grants: [{ operation: 'inventory_read', scope: { kind: 'device', id: 'device-01' } }],
      },
    })
  }
  await f.router.push({ path: '/', query: { id: last } })
  await flushPromises()
  expect(f.wrapper.text()).toContain(last)
  expect((f.wrapper.get('[data-testid="subject-id"]').element as HTMLInputElement).value).toBe(
    e.principalId,
  )
  await f.clients.authorization.changeRule(last, {
    operationId: crypto.randomUUID(),
    expectedRevision: 1,
    value: null,
  })
  await f.router.push({ path: '/', query: { id: last, refresh: '1' } })
  await flushPromises()
  expect(f.wrapper.text()).toContain('已删除')
  await f.router.push({ path: '/', query: { id: crypto.randomUUID() } })
  await flushPromises()
  expect(f.wrapper.find('[role="alert"]').exists()).toBe(true)
  f.wrapper.unmount()
})
it('does not transfer a closed ticket to another alert when its closure read fails', async () => {
  const f = await fixture(AlertsView)
  for (let i = 1; i <= 2; i++)
    f.automation.operations.observeAlert({
      code: 'compliance_noncompliant',
      severity: 'high',
      target: {
        kind: 'compliance_rule',
        id: crypto.randomUUID(),
        device: `device-0${i}`,
        revision: 1,
      },
      evidence: { id: crypto.randomUUID(), version: 1, at: f.automation.now(), state: 'active' },
    })
  const alerts = (await f.clients.alerts.list()).items,
    a = alerts.find((v) => v.target.device === 'device-01')!,
    b = alerts.find((v) => v.target.device === 'device-02')!
  await f.clients.alerts.close(a.id, {
    operationId: crypto.randomUUID(),
    expectedRevision: a.revision,
    input: { note: 'A closure reason' },
  })
  await f.wrapper
    .findAll('button')
    .find((x) => x.text() === '重新读取')!
    .trigger('click')
  await flushPromises()
  await f.wrapper
    .findAll('li button')
    .find((x) => x.text().includes('device-01'))!
    .trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain('A closure reason')
  f.inspect((o) => {
    if (o.pathParams?.['id'] === b.id && o.path.endsWith('/closure'))
      throw decodeMdmError(503, { code: 'service_unavailable' })
  })
  await f.wrapper
    .findAll('li button')
    .find((x) => x.text().includes('device-02'))!
    .trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).not.toContain('A closure reason')
  expect(f.wrapper.text()).toContain('关闭状态未知')
  expect(f.wrapper.find('[data-testid="close-alert"]').exists()).toBe(false)
  f.wrapper.unmount()
})

it('refreshes a connection test to its explicit terminal fact', async () => {
  const f = await fixture(IntegrationsView)
  await f.wrapper.get('[data-testid="connector-name"]').setValue('Probe')
  await f.wrapper
    .get('[data-testid="connector-endpoint"]')
    .setValue('https://probe.example.test/events')
  await f.wrapper.get('[data-testid="save-connector"]').trigger('click')
  await flushPromises()
  await f.wrapper
    .findAll('button')
    .find((b) => b.text() === '受理连接测试')!
    .trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain('queued')
  f.automation.tick({ kind: 'clock', at: f.automation.now() + 100 }, 'normal')
  await f.wrapper.get('[data-testid="refresh-attempt"]').trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain('passed')
  f.wrapper.unmount()
})

it('clears optional public references to null through the forms', async () => {
  const f = await fixture(IntegrationsView)
  await f.wrapper.get('[data-testid="connector-name"]').setValue('Desk')
  await f.wrapper.get('[data-testid="connector-endpoint"]').setValue('https://desk.example.test')
  const credential = f.wrapper
    .findAll('label')
    .find((v) => v.text() === '凭据引用')!
    .get('input')
  await credential.setValue('binding-1')
  await f.wrapper.get('[data-testid="save-connector"]').trigger('click')
  await flushPromises()
  await credential.setValue('')
  await f.wrapper.get('[data-testid="save-connector"]').trigger('click')
  await flushPromises()
  expect((await f.clients.admin.connectors.list()).items[0]!.definition.credentialRef).toBeNull()
  f.wrapper.unmount()
  const settings = await fixture(SettingsView)
  await settings.wrapper
    .findAll('label')
    .find((v) => v.text() === '证书引用')!
    .get('input')
    .setValue('')
  await settings.wrapper
    .findAll('label')
    .find((v) => v.text() === 'APNs 凭据引用')!
    .get('input')
    .setValue('')
  await settings.wrapper.get('[data-testid="save-configuration"]').trigger('click')
  await flushPromises()
  expect((await settings.clients.admin.settings.read()).values).toMatchObject({
    certificateRef: null,
    apnsRef: null,
  })
  settings.wrapper.unmount()
})
it('shows the exact device scope in both draft grants and effective authority', async () => {
  const f = await fixture(AuthorizationView),
    effective = await f.clients.authorization.effective(),
    id = crypto.randomUUID()
  await f.clients.authorization.changeRule(id, {
    operationId: crypto.randomUUID(),
    expectedRevision: 0,
    value: {
      subject: {
        kind: 'user',
        user: {
          instanceId: effective.instanceId,
          tenantId: TENANT,
          principalId: effective.principalId,
        },
      },
      grants: [{ operation: 'inventory_read', scope: { kind: 'device', id: 'device-exact-99' } }],
    },
  })
  await f.router.push({ path: '/', query: { id } })
  await flushPromises()
  await f.wrapper
    .findAll('button')
    .filter((v) => v.text() === '重新读取')
    .at(-1)!
    .trigger('click')
  await flushPromises()
  expect(
    f.wrapper
      .findAll('li')
      .filter(
        (v) => v.text().includes('inventory_read / device') && v.text().includes('device-exact-99'),
      ),
  ).toHaveLength(2)
  f.wrapper.unmount()
})
it('switches connector targets and clears unknown receipts, drafts and failed targets', async () => {
  const f = await fixture(IntegrationsView),
    a = crypto.randomUUID(),
    b = crypto.randomUUID()
  for (const [id, name] of [
    [a, 'Connector A'],
    [b, 'Connector B'],
  ])
    await f.clients.admin.connectors.save(id!, {
      operationId: crypto.randomUUID(),
      expectedRevision: 0,
      input: {
        name: name!,
        kind: 'itsm',
        endpoint: 'https://desk.example.test',
        credentialRef: null,
        enabled: true,
      },
    })
  await f.router.push({ path: '/', query: { id: a } })
  await flushPromises()
  expect((f.wrapper.get('[data-testid="connector-name"]').element as HTMLInputElement).value).toBe(
    'Connector A',
  )
  f.server.set('unknown')
  await f.wrapper.get('[data-testid="save-connector"]').trigger('click')
  await flushPromises()
  expect(f.wrapper.find('[data-testid="replay-write"]').exists()).toBe(true)
  f.server.set('normal')
  await f.router.push({ path: '/', query: { id: b } })
  await flushPromises()
  expect((f.wrapper.get('[data-testid="connector-name"]').element as HTMLInputElement).value).toBe(
    'Connector B',
  )
  expect(f.wrapper.find('[data-testid="replay-write"]').exists()).toBe(false)
  await f.router.push({ path: '/', query: { id: crypto.randomUUID() } })
  await flushPromises()
  expect((f.wrapper.get('[data-testid="connector-name"]').element as HTMLInputElement).value).toBe(
    '',
  )
  expect(f.wrapper.get('[data-testid="save-connector"]').element.matches(':disabled')).toBe(true)
  f.wrapper.unmount()
})

it('does not apply a connector read after its route target has changed', async () => {
  const f = await fixture(IntegrationsView),
    a = crypto.randomUUID(),
    b = crypto.randomUUID()
  for (const [id, name] of [
    [a, 'Slow A'],
    [b, 'Current B'],
  ])
    await f.clients.admin.connectors.save(id!, {
      operationId: crypto.randomUUID(),
      expectedRevision: 0,
      input: {
        name: name!,
        kind: 'itsm',
        endpoint: 'https://desk.example.test',
        credentialRef: null,
        enabled: true,
      },
    })
  let release!: () => void
  const delayed = new Promise<void>((resolve) => {
    release = resolve
  })
  f.inspect((o) => (o.method === 'GET' && o.path.endsWith(a) ? delayed : undefined))
  await f.router.push({ path: '/', query: { id: a } })
  await flushPromises()
  await f.router.push({ path: '/', query: { id: b } })
  await flushPromises()
  expect((f.wrapper.get('[data-testid="connector-name"]').element as HTMLInputElement).value).toBe(
    'Current B',
  )
  release()
  await flushPromises()
  expect((f.wrapper.get('[data-testid="connector-name"]').element as HTMLInputElement).value).toBe(
    'Current B',
  )
  f.wrapper.unmount()
})
