import { mdmKey } from '../../../../src/context'
import { expect, it } from 'vitest'
import { shallowRef, type Component } from 'vue'
import { createSoftwareClients } from '../../../../src/features/software/client'
import { createPolicyClients } from '../../policies/client'
import AlertRulesView from './AlertRulesView.vue'
import AlertsView from './AlertsView.vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { decodeMdmError } from '@rss/api/mdm'
import { demoKey } from '../../../context'
import { mdmI18n } from '../../../../src/i18n'
import { createOperationsClients } from '../client'
import { createScenario, TENANT } from '../../../scenario'
import { ADMIN } from '../../../operations/authorization'
import { createAutomationDemo } from '../../../policies/state'
import { createDeviceDemo } from '../../../devices/state'
import OrganizationView from '../../../../src/features/operations/views/OrganizationView.vue'
import DelegationsView from './DelegationsView.vue'
import ReportsView from './ReportsView.vue'
async function fixture(component: Component, realm: 'tenant' | 'platform' = 'tenant') {
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
  const runtime = {
    tenant: TENANT,
    session: {
      state: shallowRef({
        status: 'authenticated',
        tenant: TENANT,
        identity: { principalId: ADMIN },
        session: { id: ADMIN },
      }),
    },
    realm,
    operations: clients,
    software: createSoftwareClients(transport),
    policies: createPolicyClients(transport, TENANT, true),
  }
  const wrapper = mount(component, {
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
      provide: {
        [mdmKey as symbol]: runtime,
        [demoKey as symbol]: runtime,
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

it('loads the complete detail after a concurrent group change without scanning member pages', async () => {
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
    if (
      !changed &&
      o.method === 'GET' &&
      o.path === '/api/v1/authorization/user-groups/{id}' &&
      o.pathParams?.['id'] === id
    ) {
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
  expect((await f.clients.authorization.group(id)).value?.members).toEqual([...members, added])
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

it('reads delegation evidence only through its explicit demo page', async () => {
  const f = await fixture(DelegationsView)
  try {
    const page = await f.clients.admin.delegations()
    expect(page.items.length).toBeGreaterThan(0)
    expect(f.wrapper.text()).toContain(page.items[0]!.principal)
  } finally {
    f.wrapper.unmount()
  }
})
