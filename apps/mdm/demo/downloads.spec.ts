import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { decodeMdmError } from '@rss/api/mdm'
import { createSettingsDemo } from './settings'
import { createOnboardingDemo } from './enrollment'
import { createPackagesClient, installer } from '../src/features/enrollment/clients/packages'
import DownloadsView from '../src/features/enrollment/views/DownloadsView.vue'
import { mdmKey, type MdmRuntime } from '../src/context'
import { mdmI18n } from '../src/i18n'
import { createDeviceDemo } from './devices/state'
import { createAutomationDemo } from './policies/state'
import { createScenario, TENANT, MANAGEMENT_TENANT } from './scenario'

const targets = ['windows/x86_64', 'windows/aarch64', 'macos/x86_64', 'macos/aarch64']
function composition(seedDownloads = false) {
  const devices = createDeviceDemo(),
    automation = createAutomationDemo(devices),
    settings = createSettingsDemo({ seedDownloads }),
    onboarding = createOnboardingDemo(
      () => false,
      () => false,
    )
  const downstream = vi.fn(onboarding.handle)
  const scenario = createScenario(
    [(request) => automation.authorization.guard(request), settings.handle, downstream],
    () => {
      devices.reset()
      automation.reset()
      settings.reset()
      onboarding.reset()
    },
  )
  return { settings, scenario, downstream }
}

it('keeps default publication empty and offers four seeded anonymous attachments through the actual Settings/Scenario owner', async () => {
  const empty = composition()
  expect((await empty.scenario.handle('GET', '/api/v1/agent/enroll/packages')).body).toEqual([])
  const { settings, scenario, downstream } = composition(true)
  const get = (path: string) => scenario.handle('GET', path)
  const catalog = await get('/api/v1/agent/enroll/packages')
  expect(catalog.status).toBe(200)
  const packages = (catalog.body as unknown[]).map((value) => installer(value, TENANT))
  expect(packages.map((item) => `${item.target.platform}/${item.target.architecture}`)).toEqual(
    targets,
  )
  for (const item of packages) {
    expect(item.filename).toContain('MOCK-NOT-AN-INSTALLER')
    expect((await get(`/api/v1/agent/enroll/packages/${item.releaseId}`)).body).toEqual(item)
    const content = await get(`/api/v1/agent/enroll/packages/${item.releaseId}/content`)
    const bytes = new Uint8Array(content.body as ArrayBuffer)
    expect(content.status).toBe(200)
    expect(bytes.byteLength).toBe(item.length)
    expect(Array.from(createHash('sha256').update(bytes).digest())).toEqual(item.installerSha256)
    expect(new TextDecoder().decode(bytes)).toContain(
      'NOT AN INSTALLER. Synthetic text fixture only.',
    )
    expect(content.headers?.['Content-Disposition']).toContain(item.filename)
    expect(JSON.stringify(item)).not.toMatch(/secret|password|signature/)
  }
  expect(downstream).not.toHaveBeenCalled()
  expect((await get('/api/v1/agent-packages')).status).toBe(401)
  expect((await get('/api/v1/agent/enroll/configurations')).status).toBe(401)
  expect((await get('/api/v1/agent/enroll/packages/not-a-uuid/content')).status).toBe(401)
  expect(
    (
      await scenario.handle(
        'POST',
        `/api/v1/agent/enroll/packages/${packages[0]!.releaseId}/content`,
      )
    ).status,
  ).toBe(401)
  const platformLogin = await scenario.handle(
    'POST',
    `/api/v1/identity/tenants/${MANAGEMENT_TENANT}/login`,
    {
      login: 'demo',
      password: 'demo',
    },
  )
  const paths = [
    '/api/v1/agent/enroll/packages',
    `/api/v1/agent/enroll/packages/${packages[0]!.releaseId}`,
    `/api/v1/agent/enroll/packages/${packages[0]!.releaseId}/content`,
  ]
  for (const path of paths) expect((await get(path)).status).toBe(200)
  expect((await get('/api/v1/agent-packages')).status).toBe(403)
  expect(
    (
      await scenario.handle(
        'POST',
        `/api/v1/identity/tenants/${MANAGEMENT_TENANT}/session/logout`,
        {},
        {
          'x-csrf-token': (platformLogin.body as { csrfToken: string }).csrfToken,
          'x-identity-request': '1',
        },
      )
    ).status,
  ).toBe(204)
  for (const path of paths) expect((await get(path)).status).toBe(200)
  expect((await get('/api/v1/agent-packages')).status).toBe(401)
  const login = await scenario.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const withdrawn = await scenario.handle(
    'POST',
    `/api/v1/agent-packages/${packages[0]!.releaseId}/withdraw`,
    { operationId: randomUUID() },
    {
      'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
      'x-identity-request': '1',
    },
  )
  expect(withdrawn.status).toBe(204)
  expect(
    (
      await scenario.handle(
        'POST',
        `/api/v1/identity/tenants/${TENANT}/session/logout`,
        {},
        {
          'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
          'x-identity-request': '1',
        },
      )
    ).status,
  ).toBe(204)
  expect((await get('/api/v1/agent/enroll/packages')).body).toHaveLength(3)
  expect(
    (await get(`/api/v1/agent/enroll/packages/${packages[0]!.releaseId}/content`)).status,
  ).toBe(404)
  settings.reset()
  expect((await get('/api/v1/agent/enroll/packages')).body).toEqual(packages)
})

it('renders four direct download links in their Windows/macOS architecture cards from the composed scenario', async () => {
  const { scenario, downstream } = composition(true)
  const requests: string[] = []
  const transport = {
    async request<T>(options: RequestOptions<T>) {
      requests.push(`${options.method} ${options.path}`)
      const response = await scenario.handle(options.method, options.path)
      if (response.status !== options.successStatus)
        throw decodeMdmError(response.status, response.body)
      return options.decode(response.body)
    },
  } as HttpTransport
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/downloads/agent', component: DownloadsView }],
  })
  await router.push('/downloads/agent')
  await router.isReady()
  const wrapper = mount(DownloadsView, {
    global: {
      plugins: [router, mdmI18n()],
      provide: {
        [mdmKey as symbol]: {
          onboarding: { packages: createPackagesClient(transport, TENANT) },
        } as MdmRuntime,
      },
    },
  })
  try {
    await flushPromises()
    const cards = wrapper.findAll('[data-download-target]')
    expect(cards.map((card) => card.attributes('data-download-target'))).toEqual(targets)
    expect(wrapper.findAll('a[download]')).toHaveLength(4)
    for (const [index, card] of cards.entries()) {
      const link = card.get('a[download]')
      expect(link.attributes('download')).toContain('MOCK-NOT-AN-INSTALLER')
      expect(link.attributes('href')).toMatch(
        /^\/api\/v1\/agent\/enroll\/packages\/[0-9a-f-]{36}\/content$/,
      )
      expect(link.text()).toContain(['Windows', 'Windows', 'macOS', 'macOS'][index]!)
      expect(link.text()).toContain(index % 2 === 0 ? 'x64' : 'ARM64')
    }
    expect(wrapper.findAll('select')).toHaveLength(0)
    expect(requests).toEqual(['GET /api/v1/agent/enroll/packages'])
    expect(downstream).not.toHaveBeenCalled()
  } finally {
    wrapper.unmount()
  }
})
