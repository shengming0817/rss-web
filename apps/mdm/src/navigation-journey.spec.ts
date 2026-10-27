import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions, NoContentRequest } from '@rss/api/mdm'
import { decodeMdmError } from '@rss/api/mdm'
const transportOwner = vi.hoisted(() => ({ value: undefined as HttpTransport | undefined }))
vi.mock('@rss/api/mdm', async (original) => ({
  ...(await original<object>()),
  createMdmTransport: () => transportOwner.value,
}))
import { createDemo } from '../demo/bootstrap'
import { createScenario, TENANT } from '../demo/scenario'
import { createAutomationDemo } from '../demo/policies/state'
import { createDeviceDemo } from '../demo/devices/state'
import { seedScriptPolicies } from '../demo/policies/seed'
import { createOnboardingDemo } from '../demo/enrollment'
import { createImportsDemo } from '../demo/software/imports'
import { createPolicyClients } from './features/policies/client'
import { operation } from './services/useOperation'
import { navigation, navigationTarget } from './components/navigation'
async function start() {
  const devices = createDeviceDemo(),
    automation = createAutomationDemo(devices)
  devices.bindAuthorization(automation.authorization.can)
  const seed = seedScriptPolicies(automation),
    onboarding = createOnboardingDemo(automation.authorization.can, devices.registrationAllowed),
    publication = automation.publication,
    imports = createImportsDemo(automation.resources, automation.lifecycle)
  const server = createScenario(
    [
      (request) => automation.authorization.guard(request),
      onboarding.handle,
      publication.handle,
      imports.handle,
      automation.handle,
      devices.handle,
    ],
    () => {},
    automation.tick,
    automation.observe,
    automation.now,
  )
  const calls: { path: string; method: string; body: unknown; query: Record<string, string> }[] = []
  const transport = {
    async request(o: RequestOptions<unknown> | NoContentRequest) {
      const path = o.path.replace(/\{([^}]+)\}/g, (_, key: string) =>
        encodeURIComponent(o.pathParams?.[key] ?? ''),
      )
      const query = new URLSearchParams(
        Object.entries(o.query ?? {})
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      )
      calls.push({ path, method: o.method, body: o.body, query: Object.fromEntries(query) })
      const reply = await server.handle(
        o.method,
        path + '?' + query,
        o.body,
        Object.fromEntries(Object.entries(o.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
      )
      if (reply.status !== o.successStatus) throw decodeMdmError(reply.status, reply.body)
      return 'decode' in o ? o.decode(reply.body) : undefined
    },
  } as HttpTransport
  transportOwner.value = transport
  document.body.innerHTML = '<div id="app"></div>'
  window.history.replaceState(null, '', '/')
  const runtime = createDemo(
    transport,
    { canonicalOrigin: window.location.origin, oidcEnabled: false },
    {
      canonicalOrigin: window.location.origin,
      serviceId: '44444444-4444-4444-8444-444444444444',
      tenant: TENANT,
      managementTenant: '99999999-9999-4999-8999-999999999999',
    },
  )
  runtime.mount()
  await runtime.router.isReady()
  await runtime.session.login(TENANT, 'demo', 'demo')
  const policies = createPolicyClients(runtime.transport)
  const published = await policies.scopes.change(
    seed.scope,
    operation(
      {
        action: 'put',
        definition: {
          targets: [{ kind: 'device', id: 'device-01' }],
          limitations: null,
          exclusions: [],
        },
      },
      1,
    ),
  )
  await policies.scopes.status(seed.scope, published.task!)
  await policies.scopes.status(seed.scope, published.task!)
  await runtime.router.push({ name: 'workspace', params: { tenant: TENANT } })
  await flushPromises()
  const cleanup = () => {
    runtime.app.unmount()
    runtime.session.clear()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
    window.history.replaceState(null, '', '/')
  }
  return { ...runtime, calls, seed, cleanup }
}
it('navigates each product section through the real application router and its lazy page consumers', async () => {
  const app = await start()
  try {
    for (const section of navigation) {
      await app.router.push(navigationTarget(section.items[0]!, TENANT))
      await flushPromises()
      for (const item of section.items) {
        const target = app.router.resolve(navigationTarget(item, TENANT)).fullPath
        const link = [...document.querySelectorAll<HTMLAnchorElement>('nav a')].find(
          (a) =>
            a.closest('nav')?.getAttribute('aria-label') ===
              app.i18n.global.t('console.navigation') && a.getAttribute('href') === target,
        )
        expect(link, item.name).toBeDefined()
        await new DOMWrapper(link!).trigger('click')
        await flushPromises()
        await vi.waitFor(() => {
          expect(app.router.currentRoute.value.name).toBe(item.name)
          expect(app.router.currentRoute.value.fullPath).toBe(target)
        })
        expect(document.querySelector('main h1')?.textContent?.trim(), item.name).toBeTruthy()
      }
    }
    expect(app.calls.some((c) => c.path === '/api/v1/operations')).toBe(true)
    expect(app.calls.some((c) => c.path === '/api/v1/resources')).toBe(true)
  } finally {
    app.cleanup()
  }
}, 20000)
async function press(
  app: Awaited<ReturnType<typeof start>>,
  key: string,
  scope: Pick<DOMWrapper<Element>, 'findAll'> = new DOMWrapper(document.body),
  selector = 'button',
) {
  const buttons = scope
    .findAll(selector)
    .filter((button) => button.isVisible() && button.text().trim() === app.i18n.global.t(key))
  expect(buttons, key).toHaveLength(1)
  const target = buttons[0]!
  expect(target.element.matches(':disabled'), key).toBe(false)
  await target.trigger('click')
  await flushPromises()
}
async function selectOption(
  control: Pick<DOMWrapper<Element>, 'element' | 'isVisible'>,
  label: string,
) {
  expect(control.isVisible()).toBe(true)
  await new DOMWrapper(control.element.closest('.v-field')!).trigger('mousedown')
  await flushPromises()
  let option: DOMWrapper<Element> | undefined
  await vi.waitFor(() => {
    option = new DOMWrapper(document.body)
      .findAll('[role=option]')
      .find((item) => item.isVisible() && item.text().trim() === label)
    expect(option, label).toBeDefined()
  })
  await option!.trigger('click')
  await flushPromises()
}
it('creates a formal Scope, changes the result channel explicitly, and deletes only its authored definition', async () => {
  const app = await start()
  try {
    await app.router.push({
      name: 'policy-policies',
      params: { tenant: TENANT },
    })
    await flushPromises()
    await press(app, 'policies.create')
    await press(app, 'policies.scopeEditor.manage')
    const scopeManager = new DOMWrapper(document.body).get('[role=dialog]')
    await press(app, 'policies.create', scopeManager)
    const scopeForm = new DOMWrapper(document.body).get('form.scope-form')
    const targets = scopeForm
      .findAll('.task-scope-role')
      .find((section) => section.get('h3').text() === app.i18n.global.t('policies.targets'))!
    await press(app, 'console.chooseLoaded', targets)
    await selectOption(targets.get('input[id$="-choice"]'), 'device-01')
    await press(app, 'policies.add', targets)
    await press(app, 'policies.save', scopeForm)
    await flushPromises()
    const write = app.calls.findLast(
      (c) => c.method === 'POST' && /^\/api\/v1\/scopes\/[^/]+$/.test(c.path),
    )!
    expect(write.body).toMatchObject({
      expectedRevision: 0,
      input: {
        action: 'put',
        definition: {
          targets: [{ kind: 'device', id: 'device-01' }],
          limitations: null,
          exclusions: [],
        },
      },
    })
    await press(app, 'policies.refresh', scopeManager)
    await press(app, 'policies.refresh', scopeManager)
    await scopeManager
      .findAll('[role=tab]')
      .find((tab) => tab.text() === '判定说明')!
      .trigger('click')
    const results = scopeManager.get('.scope-results')
    const channel = results.get('input[role=combobox]')
    await selectOption(channel, 'Agent')
    await press(app, 'policies.open', results)
    expect(results.text()).toContain('device-01')
    const agentRead = app.calls.findLast((call) => call.path.includes('/results/'))!
    expect(agentRead).toMatchObject({ method: 'GET', query: { channel: 'agent' } })
    expect(agentRead.path).toMatch(new RegExp(`^${write.path}/results/[^/]+/decisions$`))
    const reads = app.calls.filter((c) => c.path.includes('/results/')).length
    await selectOption(channel, 'MDM')
    expect(app.calls.filter((c) => c.path.includes('/results/'))).toHaveLength(reads)
    await press(app, 'policies.open', results)
    expect(app.calls.filter((c) => c.path.includes('/results/'))).toHaveLength(reads + 1)
    expect(app.calls.at(-1)).toMatchObject({
      method: 'GET',
      path: agentRead.path,
      query: { channel: 'mdm' },
    })
    await press(app, 'console.edit', scopeManager)
    await press(
      app,
      'policies.remove',
      new DOMWrapper(document.body).get('form.scope-form'),
      ':scope > fieldset > button',
    )
    expect(
      app.calls.findLast((c) => c.method === 'POST' && c.path === write.path)?.body,
    ).toMatchObject({ expectedRevision: 1, input: { action: 'delete' } })
  } finally {
    app.cleanup()
  }
}, 20000)
