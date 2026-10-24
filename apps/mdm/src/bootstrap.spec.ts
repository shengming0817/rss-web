import { afterEach, expect, it, vi } from 'vitest'
import { inject } from 'vue'
import { runtimeKey } from '@rss/auth'
import { decodeIdentityError } from '@rss/api/identity'
import type { HttpTransport, RequestOptions } from '@rss/api/identity'
import { mdmKey } from './context'
import { createMdm } from './bootstrap'
import { settingsDestination } from './features/settings/destinations'
import { entries } from './features/settings/entries'
import { navigationKey } from './components/navigation'
const businessCalls = vi.hoisted(() => [] as string[])
vi.mock('@rss/api/mdm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@rss/api/mdm')>()),
  createMdmTransport: () => ({
    request: (o: RequestOptions<unknown>) => {
      businessCalls.push(o.path)
      return o.path === '/api/v1/authorization'
        ? Promise.resolve(
            o.decode({
              instanceId: '22222222-2222-4222-8222-222222222222',
              tenantId: '11111111-1111-4111-8111-111111111111',
              principalId: '22222222-2222-4222-8222-222222222222',
              grants: [],
            }),
          )
        : Promise.reject(new Error('Live unavailable'))
    },
  }),
}))
const tenant = '11111111-1111-4111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
const running: ReturnType<typeof createMdm>[] = []
afterEach(() => {
  for (const runtime of running) {
    runtime.session.clear()
    runtime.app.unmount()
    runtime.router.options.history.destroy()
  }
  running.length = 0
  businessCalls.length = 0
  document.body.innerHTML = ''
})
it('provides the same session owner to auth, MDM and protected routes', async () => {
  document.body.innerHTML = '<div id="app"></div>'
  const transport = {
    async request(options: RequestOptions<unknown>) {
      const value = options.path.endsWith('/context')
        ? {
            tenantId: tenant,
            principalId: id,
            sessionId: id,
            navigation: { manageAccounts: false, manageProviders: false },
          }
        : {
            session: { id, issuedAt: 1, idleExpiresAt: 4102444800, absoluteExpiresAt: 4102444900 },
            identity: { principalId: id, hasLocalPassword: true },
            csrfToken: 'a'.repeat(64),
          }
      return options.decode(value)
    },
  } as HttpTransport
  const runtime = createMdm(
    transport,
    { canonicalOrigin: 'https://mdm.example.test', oidcEnabled: false },
    {
      canonicalOrigin: 'https://mdm.example.test',
      serviceId: id,
      tenant,
      managementTenant: '99999999-9999-4999-8999-999999999999',
    },
  )
  runtime.app.provide(navigationKey, [
    {
      id: 'policies',
      label: 'mdm.policies',
      items: [{ name: 'policy-policies', label: 'security.risks' }],
    },
  ])
  expect(settingsDestination(entries['device-key'].target, tenant)).toBeUndefined()
  for (const entry of Object.values(entries)) {
    const target = settingsDestination(entry.target, tenant)
    if (target) expect(runtime.router.resolve(target).matched.length).toBeGreaterThan(0)
  }
  runtime.mount()
  running.push(runtime)
  await runtime.router.isReady()
  runtime.app.runWithContext(() => {
    expect(inject(runtimeKey)?.session).toBe(runtime.session)
    expect(inject(mdmKey)?.session).toBe(runtime.session)
  })
  await vi.waitFor(() => expect(runtime.router.currentRoute.value.name).toBe('workspace'))
  await vi.waitFor(() => expect(document.body.textContent).toContain('当前无法读取导航'))
  expect(runtime.session.state.value.status).toBe('authenticated')
  for (const path of [
    'security/requests',
    'security/support',
    'security/risks',
    'security/baselines',
    'security/certificates',
    'security/experience',
    'security/actions',
    'policies/configurations',
    'operations/reports',
    'operations/alerts',
    'operations/alert-rules',
  ]) {
    await runtime.router.push(`/tenants/${tenant}/${path}`)
    expect(runtime.router.currentRoute.value.matched.at(-1)?.path).toBe('/:pathMatch(.*)*')
  }
  expect(
    businessCalls.some((path) =>
      /mdm-candidate\/(security|operations|authorization|policies)/.test(path),
    ),
  ).toBe(false)
  for (const name of [
    'security-compliance',
    'security-certificate-archive',
    'security-rules',
    'policy-policies',
    'policy-executions',
    'software-catalog',
    'operations-authorization',
    'operations-audit',
    'operations-diagnostics',
    'settings-overview',
  ])
    expect(runtime.router.hasRoute(name)).toBe(true)
  runtime.app.runWithContext(() => {
    const mdm = inject(mdmKey)!
    expect(mdm.security.credentials.list).toBeTypeOf('function')
    expect(mdm.security).not.toHaveProperty('requests')
    expect(Object.keys(mdm.operations).sort()).toEqual(['audit', 'authorization'])
    expect(mdm.policies).not.toHaveProperty('configurations')
  })

  await runtime.router.push({ name: 'policy-policies', params: { tenant } })
  await vi.waitFor(() =>
    expect(
      document.querySelector('.console-breadcrumb > span[aria-current=page]')?.textContent,
    ).toBe(runtime.i18n.global.t('security.risks')),
  )
  document.querySelector<HTMLButtonElement>('.console-command-trigger')!.click()
  await vi.waitFor(() =>
    expect(
      document.querySelector(
        `.console-command-results a[href="/tenants/${tenant}/policies/assignments"]`,
      )?.textContent,
    ).toContain(runtime.i18n.global.t('security.risks')),
  )

  await runtime.router.push(`/tenants/33333333-3333-4333-8333-333333333333/workspace`)
  expect(runtime.router.currentRoute.value.name).toBe('error')
})

it('composes platform routes with one independent local session and no business routes', async () => {
  const managementTenant = '99999999-9999-4999-8999-999999999999'
  window.history.replaceState(null, '', '/platform')
  document.body.innerHTML = '<div id="app"></div>'
  const transport = {
    request: async (o: RequestOptions<unknown>) =>
      o.decode(
        o.path.endsWith('/context')
          ? {
              tenantId: managementTenant,
              principalId: id,
              sessionId: id,
              navigation: { manageAccounts: true, manageProviders: false },
            }
          : {
              session: {
                id,
                issuedAt: 1,
                idleExpiresAt: 4102444800,
                absoluteExpiresAt: 4102444900,
              },
              identity: { principalId: id, hasLocalPassword: true },
              csrfToken: 'a'.repeat(64),
            },
      ),
  } as HttpTransport
  const runtime = createMdm(
    transport,
    { canonicalOrigin: 'https://mdm.example.test', oidcEnabled: true },
    { canonicalOrigin: 'https://mdm.example.test', serviceId: id, tenant, managementTenant },
  )
  runtime.mount()
  running.push(runtime)
  await runtime.router.isReady()
  expect(runtime.session.config.oidcEnabled).toBe(false)
  expect(runtime.router.hasRoute('devices')).toBe(false)
  expect(runtime.router.hasRoute('self-enrollments')).toBe(false)
  await vi.waitFor(() => expect(runtime.router.currentRoute.value.name).toBe('settings-overview'))
  runtime.app.runWithContext(() => expect(inject(mdmKey)?.settings.operations).toBeDefined())
  await runtime.router.push(`/tenants/${tenant}/settings`)
  expect(runtime.router.currentRoute.value.name).toBe('error')
  window.history.replaceState(null, '', '/')
})

it.each(['/', '/login'])(
  'opens %s as normal anonymous business sign-in without UUID or expired messaging',
  async (path) => {
    window.history.replaceState(null, '', path)
    document.body.innerHTML = '<div id="app"></div>'
    const request = vi.fn(async () => {
      throw decodeIdentityError(401, { code: 'invalid_credential' })
    })
    const runtime = createMdm(
      { request } as unknown as HttpTransport,
      { canonicalOrigin: 'https://mdm.example.test', oidcEnabled: false },
      {
        canonicalOrigin: 'https://mdm.example.test',
        serviceId: id,
        tenant,
        managementTenant: '99999999-9999-4999-8999-999999999999',
      },
    )
    runtime.mount()
    running.push(runtime)
    await runtime.router.isReady()
    await vi.waitFor(() => expect(document.querySelector('#login-name')).not.toBeNull())
    expect(runtime.router.currentRoute.value.path).toBe('/login')
    expect(document.body.textContent).toContain('业务组织')
    expect(document.body.textContent).not.toContain('会话已失效')
    expect(document.body.textContent).not.toContain(tenant)
    expect(runtime.router.resolve(`/tenants/${tenant}/login`).name).not.toBe('login')
    expect(document.querySelector('a[href="/platform"]')).not.toBeNull()
  },
)
