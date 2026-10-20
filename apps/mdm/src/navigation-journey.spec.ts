import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions, NoContentRequest } from '@rss/api/mdm'
import { decodeMdmError } from '@rss/api/mdm'
const transportOwner = vi.hoisted(() => ({ value: undefined as HttpTransport | undefined }))
vi.mock('@rss/api/mdm', async (original) => ({
  ...(await original<object>()),
  createMdmTransport: () => transportOwner.value,
}))
import { startMdm } from './bootstrap'
import { createScenario, TENANT } from '../demo/scenario'
import { createAutomationDemo } from '../demo/policies/state'
import { createDeviceDemo } from '../demo/devices/state'
import { seedScriptPolicies } from '../demo/policies/seed'
import { createOnboardingDemo } from '../demo/enrollment'
import { createImportsDemo } from '../demo/software/imports'
import { createPolicyClients } from './features/policies/client'
import { operation } from './services/useOperation'
import { navigation } from './components/navigation'
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
  const calls: { path: string; method: string; body: unknown }[] = []
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
      calls.push({ path, method: o.method, body: o.body })
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
  const runtime = startMdm(
    transport,
    { canonicalOrigin: window.location.origin, oidcEnabled: false },
    {
      canonicalOrigin: window.location.origin,
      tenant: TENANT,
      managementTenant: '99999999-9999-4999-8999-999999999999',
    },
    true,
  )
  await runtime.router.isReady()
  await runtime.session.login(TENANT, 'demo', 'demo')
  const policies = createPolicyClients(runtime.transport, TENANT, true)
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
      await app.router.push({ name: section.items[0]!.name, params: { tenant: TENANT } })
      await flushPromises()
      for (const item of section.items) {
        const target = app.router.resolve({ name: item.name, params: { tenant: TENANT } }).fullPath
        const link = [...document.querySelectorAll<HTMLAnchorElement>('.console-sidebar a')].find(
          (a) => a.getAttribute('href') === target,
        )
        expect(link, item.name).toBeDefined()
        await new DOMWrapper(link!).trigger('click')
        await flushPromises()
        await vi.waitFor(() => expect(app.router.currentRoute.value.name).toBe(item.name))
        expect(document.querySelector('main h1')?.textContent?.trim(), item.name).toBeTruthy()
      }
    }
    expect(app.calls.some((c) => c.path === '/api/v1/operations')).toBe(true)
    expect(app.calls.some((c) => c.path === '/api/v1/resources')).toBe(true)
  } finally {
    app.cleanup()
  }
}, 20000)
const main = () => new DOMWrapper(document.querySelector('main')!)
async function press(app: Awaited<ReturnType<typeof start>>, key: string, last = false) {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')].filter(
    (b) => b.textContent?.trim() === app.i18n.global.t(key),
  )
  const target = last ? buttons.at(-1) : buttons[0]
  expect(target, key).toBeDefined()
  expect(target!.matches(':disabled'), key).toBe(false)
  await new DOMWrapper(target!).trigger('click')
  await flushPromises()
}
it('creates a formal Scope, changes the result channel explicitly, and deletes only its authored definition', async () => {
  const app = await start()
  try {
    await app.router.push({
      name: 'policy-scopes',
      params: { tenant: TENANT },
      query: { device: 'device-01' },
    })
    await flushPromises()
    await main().get('form').trigger('submit')
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
    await press(app, 'policies.refresh')
    await press(app, 'policies.refresh')
    await main().get('#scope-projection').setValue('decisions')
    const channel = main()
      .findAll('select')
      .find((s) => s.find('option[value=agent]').exists())!
    await channel.setValue('agent')
    await press(app, 'policies.open', true)
    expect(main().text()).toContain('device-01')
    const reads = app.calls.filter((c) => c.path.includes('/results/')).length
    await channel.setValue('mdm')
    expect(app.calls.filter((c) => c.path.includes('/results/'))).toHaveLength(reads)
    await press(app, 'policies.open', true)
    expect(app.calls.filter((c) => c.path.includes('/results/'))).toHaveLength(reads + 1)
    await press(app, 'console.edit')
    await press(app, 'policies.remove', true)
    expect(
      app.calls.findLast((c) => c.method === 'POST' && c.path === write.path)?.body,
    ).toMatchObject({ expectedRevision: 1, input: { action: 'delete' } })
  } finally {
    app.cleanup()
  }
}, 20000)
it('versions, compares and preflights a platform configuration without treating preview as an applied effect', async () => {
  const app = await start()
  try {
    await app.router.push({ name: 'policy-configurations', params: { tenant: TENANT } })
    await flushPromises()
    await press(app, 'policies.create')
    await main().get('#configuration-name').setValue('Firewall preview')
    await main().get('form').trigger('submit')
    await flushPromises()
    await press(app, 'console.edit')
    await press(app, 'policies.loadTemplate')
    await main().get('form').trigger('submit')
    await flushPromises()
    await press(app, 'policies.publish')
    await press(app, 'policies.copySettings')
    await main().get('#setting-type-0').setValue('number')
    await main().get('#setting-value-0').setValue(1)
    await main().get('form').trigger('submit')
    await flushPromises()
    await main().get('#configuration-from').setValue(1)
    await main().get('#configuration-to').setValue(2)
    await press(app, 'policies.open', true)
    expect(main().text()).toContain('./Vendor/MSFT/Firewall/MdmStore/DomainProfile/EnableFirewall')
    await main().get('#configuration-scope').setValue(app.seed.scope)
    await main().get('#configuration-version').setValue(1)
    await press(app, 'policies.preview')
    await press(app, 'policies.refresh')
    await press(app, 'policies.refresh')
    expect(app.calls.some((c) => c.method === 'POST' && c.path.endsWith('/previews'))).toBe(true)
    expect(main().text()).toContain(app.i18n.global.t('policies.state.unknown'))
  } finally {
    app.cleanup()
  }
}, 20000)
