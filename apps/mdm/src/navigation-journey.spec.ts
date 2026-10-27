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
import { createPolicyClients } from '../demo/features/policies/client'
import { operation } from './services/useOperation'
import { softwarePolicy } from './features/software/clients/assignment-model'
import { navigation, navigationTarget, platformNavigation } from './components/navigation'
async function start(platform = false) {
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
  window.history.replaceState(null, '', platform ? '/platform' : '/')
  const runtime = createDemo(
    transport,
    { canonicalOrigin: window.location.origin, oidcEnabled: false },
    {
      canonicalOrigin: window.location.origin,
      serviceId: '44444444-4444-4444-8444-444444444444',
      tenant: TENANT,
      managementTenant: platform ? TENANT : '99999999-9999-4999-8999-999999999999',
    },
  )
  runtime.mount()
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
it('opens a software policy from the workspace through the supported software page', async () => {
  const app = await start()
  try {
    const id = crypto.randomUUID()
    const policy = softwarePolicy({
      id,
      revision: 1,
      version: 1,
      versionId: crypto.randomUUID(),
      state: 'enabled',
      definition: {
        customEvent: null,
        alias: null,
        scope: app.seed.scope,
        action: {
          kind: 'software',
          channel: 'agent',
          delivery: { kind: 'direct' },
          resource: {
            kind: 'software',
            id: 'workspace-software',
            version: '1',
            variants: { windows_x86_64: 'main' },
          },
          intent: 'required_install',
          schedule: {
            trigger: { kind: 'check_in', minimumSeconds: 60 },
            misfire: { kind: 'coalesce_one' },
            notBefore: 0,
            until: null,
            jitterSeconds: 0,
            window: null,
          },
          runLifetimeSeconds: 3600,
          rollout: {
            stages: [{ scope: app.seed.scope, opensAt: 0, minimumVerifiedPercent: null }],
          },
        },
      },
    })
    vi.spyOn(app.mdm.policies.policies, 'list').mockResolvedValue({
      items: [{ ...policy, customEvent: null, alias: null, toolName: 'workspace-software' }],
      nextCursor: null,
    })
    const read = vi.spyOn(app.mdm.policies.policies, 'read').mockResolvedValue(policy)
    await app.router.push({ name: 'settings-overview', params: { tenant: TENANT } })
    await app.router.push({ name: 'workspace', params: { tenant: TENANT } })
    await flushPromises()
    const link = new DOMWrapper(document.body).get('.console-deployment-list a')
    await link.trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(app.router.currentRoute.value.name).toBe('policy-policies'))
    await flushPromises()
    expect(app.router.currentRoute.value.query['id']).toBe(id)
    expect(read).toHaveBeenCalledWith(id)
    expect(document.querySelector('main h1')?.textContent).toBe(
      app.i18n.global.t('software.deployments'),
    )
    expect(document.querySelector('main')?.textContent).toContain('workspace-software')
    expect(document.querySelector('main')?.textContent).not.toContain(
      app.i18n.global.t('devices.invalidResponse'),
    )
  } finally {
    vi.restoreAllMocks()
    app.cleanup()
  }
}, 20000)
it('expands mobile submenus after collapsing the desktop drawer', async () => {
  const width = window.innerWidth
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1440 })
  const app = await start()
  try {
    await app.router.push({ name: 'settings-overview', params: { tenant: TENANT } })
    await flushPromises()
    await new DOMWrapper(document.body)
      .get(`button[aria-label="${app.i18n.global.t('console.collapseNavigation')}"]`)
      .trigger('click')
    await flushPromises()
    expect(document.querySelector('.mdm-navigation-children')).toBeNull()
    window.innerWidth = 390
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    await new DOMWrapper(document.body)
      .get(`button[aria-label="${app.i18n.global.t('console.navigation')}"]`)
      .trigger('click')
    await flushPromises()
    const target = app.router.resolve({ name: 'settings-access', params: { tenant: TENANT } }).href
    expect(document.querySelector(`.mdm-navigation-children a[href="${target}"]`)).not.toBeNull()
  } finally {
    app.cleanup()
    window.innerWidth = width
    window.dispatchEvent(new Event('resize'))
  }
}, 20000)
it('renders platform navigation without resolving tenant-only device links', async () => {
  const app = await start(true)
  const errors: unknown[] = []
  app.app.config.errorHandler = (error) => errors.push(error)
  try {
    for (const section of platformNavigation) {
      for (const item of section.items) {
        await app.router.push(navigationTarget(item, TENANT))
        await flushPromises()
        expect(app.router.currentRoute.value.name).toBe(item.name)
        expect(document.querySelector('main h1')?.textContent?.trim(), item.name).toBeTruthy()
        expect(errors).toEqual([])
      }
    }
    expect(app.router.hasRoute('device-groups')).toBe(false)
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
      name: 'policy-policies',
      params: { tenant: TENANT },
      query: { device: 'device-01' },
    })
    await flushPromises()
    const scopeDialog = () => new DOMWrapper(document.body).get('[role=dialog]')
    const form = scopeDialog().get('form')
    const scopeWrites = () =>
      app.calls.filter((c) => c.method === 'POST' && /^\/api\/v1\/scopes\/[^/]+$/.test(c.path))
    const before = scopeWrites().length
    await vi.waitFor(() =>
      expect(form.get('button[type=submit]').element.matches(':disabled')).toBe(false),
    )
    await form.trigger('submit')
    await vi.waitFor(() => expect(scopeWrites()).toHaveLength(before + 1))
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
    await scopeDialog()
      .findAll('[role=tab]')
      .find((tab) => tab.text() === '判定说明')!
      .trigger('click')
    const channel = scopeDialog().get('.scope-results input[role=combobox]')
    async function chooseChannel(label: string) {
      await channel.trigger('keydown', { key: 'ArrowDown' })
      await flushPromises()
      await new DOMWrapper(document.body)
        .findAll('[role=option]')
        .find((option) => option.isVisible() && option.text() === label)!
        .trigger('click')
      await flushPromises()
    }
    await chooseChannel('Agent')
    await press(app, 'policies.open', true)
    expect(main().text()).toContain('device-01')
    const reads = app.calls.filter((c) => c.path.includes('/results/')).length
    await chooseChannel('MDM')
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
