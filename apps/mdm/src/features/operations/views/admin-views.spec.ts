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
  const login = await server.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
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
          software: createSoftwareClients(transport),
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
it('uses the workflow queue for approvals', async () => {
  const f = await fixture(ApprovalsView)
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
it('opens group/report links and follows target query changes', async () => {
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
  expect(group.wrapper.get('[data-testid="group-name"]').isVisible()).toBe(true)
  expect(group.wrapper.get('details').attributes('open')).toBeDefined()
  expect((group.wrapper.get('[data-testid="group-name"]').element as HTMLInputElement).value).toBe(
    'Linked group',
  )
  await group.router.push({ path: '/', query: { id: other } })
  await flushPromises()
  expect(group.wrapper.get('[data-testid="group-name"]').isVisible()).toBe(true)
  expect(group.wrapper.get('details').attributes('open')).toBeDefined()
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
it('selects the delegation panel for audit deep links and returns to groups on query change', async () => {
  const f = await fixture(OrganizationView)
  try {
    const page = await f.clients.admin.delegations()
    expect(page.items.length).toBeGreaterThan(0)
    await f.router.push({ path: '/', query: { id: page.items[0]!.id, kind: 'delegation' } })
    await flushPromises()
    expect(
      f.wrapper
        .findAll('[role=tab]')
        .find((tab) => tab.text() === '组织委派')!
        .attributes('aria-selected'),
    ).toBe('true')
    expect(f.wrapper.get('[role=tabpanel][data-state=active]').text()).toContain(
      page.items[0]!.principal,
    )
    await f.router.push({ path: '/', query: {} })
    await flushPromises()
    expect(
      f.wrapper
        .findAll('[role=tab]')
        .find((tab) => tab.text() === '用户组与完整成员')!
        .attributes('aria-selected'),
    ).toBe('true')
  } finally {
    f.wrapper.unmount()
  }
})
it('authors an explicit department grant and adopts a concurrent revision before deleting it', async () => {
  const f = await fixture(AuthorizationView)
  const click = async (text: string) => {
    await f.wrapper
      .findAll('button')
      .find((b) => b.text() === text)!
      .trigger('click')
    await flushPromises()
  }
  await click('新建授权规则')
  const form = f.wrapper.get('form')
  await form.findAll('select')[0]!.setValue('department')
  await form.get('[data-testid=subject-id]').setValue('engineering')
  const inputs = form.findAll('input')
  await inputs[1]!.setValue('66666666-6666-4666-8666-666666666666')
  await inputs[2]!.setValue('https://idp.example.test')
  await inputs[3]!.setValue(1)
  await form.findAll('select')[1]!.setValue('subtree')
  await form.findAll('select')[2]!.setValue('inventory_read')
  await form.findAll('select')[3]!.setValue('device')
  await form.findAll('input').at(-1)!.setValue('device-01')
  await click('添加授权')
  await f.wrapper.get('[data-testid=save-rule]').trigger('click')
  await flushPromises()
  const saved = (await f.clients.authorization.rules()).items.find(
    (r) => r.value?.subject.kind === 'department' && r.value.subject.id === 'engineering',
  )!
  expect(saved.value).toMatchObject({
    subject: {
      kind: 'department',
      id: 'engineering',
      matching: 'subtree',
      source: { configurationVersion: 1 },
    },
    grants: [{ operation: 'inventory_read', scope: { kind: 'device', id: 'device-01' } }],
  })
  await f.clients.authorization.changeRule(saved.id, {
    operationId: crypto.randomUUID(),
    expectedRevision: 1,
    value: {
      ...saved.value!,
      grants: [{ operation: 'inventory_read', scope: { kind: 'all_devices' } }],
    },
  })
  await click('读取服务器版本并比较')
  expect(f.wrapper.text()).toContain('all_devices')
  await click('保留草稿，采用当前 revision')
  await form.get('input[type=checkbox]').setValue(true)
  await click('删除')
  expect((await f.clients.authorization.findRule(saved.id))?.value).toBeNull()
  f.wrapper.unmount()
})
