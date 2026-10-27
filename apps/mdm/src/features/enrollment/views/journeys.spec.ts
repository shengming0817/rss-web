import { defineComponent, h, shallowRef } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import type { HttpTransport, RequestOptions, NoContentRequest } from '@rss/api/mdm'
import { decodeMdmError } from '@rss/api/mdm'
import { networkErrorForTest } from '@rss/api/testing'
import { createRegistrationChannelsClient } from '../../../services/registrationChannels'
import { createRegistrationChannels } from '../../../services/registrationChannelState'
import { createDeviceClients } from '../../devices/client'
import SelfEnrollmentView from '../../devices/views/SelfEnrollmentView.vue'
import { createDeviceDemo } from '../../../../demo/devices/state'
import { generateEnrollmentPassword, decodeEnrollment } from '../../devices/clients/enrollment'
import { enrollmentTargetKey } from '../target'
import { createDemoEnrollmentTargetResolver } from '../../../../demo/features/enrollment/target'
import { mdmKey, type MdmRuntime } from '../../../context'
import { mdmI18n } from '../../../i18n'
import { createOnboardingClients } from '../client'
import { createOnboardingDemo } from '../../../../demo/enrollment'
import { ADMIN, INSTANCE } from '../../../../demo/operations/authorization'
import { TENANT } from '../../../../demo/scenario'
import ConfigurationsView from './ConfigurationsView.vue'
import NativeFacts from '../components/NativeFacts.vue'
import SelfEnrollmentProgress from '../components/SelfEnrollmentProgress.vue'
import TermsView from './TermsView.vue'
import DownloadsView from './DownloadsView.vue'
import AppleAccountView from './AppleAccountView.vue'
import AppleAdeView from './AppleAdeView.vue'
import WindowsEntraView from './WindowsEntraView.vue'
const wrappers: VueWrapper[] = []
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})
async function setup(view: unknown, allow = true, targetEvidence = false) {
  const devices = createDeviceDemo()
  const domain = createOnboardingDemo(() => allow, devices.registrationAllowed),
    calls: string[] = [],
    lost = { path: '' },
    state = shallowRef({
      status: 'authenticated',
      tenant: TENANT,
      identity: { principalId: ADMIN },
      session: { id: INSTANCE },
    })
  const transport = {
    async request<T>(o: RequestOptions<T> | NoContentRequest) {
      const path = o.path.replace(/\{([^}]+)\}/g, (_m, key: string) =>
        encodeURIComponent(o.pathParams?.[key] ?? ''),
      )
      calls.push(`${o.method} ${path}`)
      const request = {
        method: o.method,
        path,
        body: o.body,
        query: new URLSearchParams(
          Object.entries(o.query ?? {})
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)]),
        ),
        headers: Object.fromEntries(
          Object.entries(o.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
        ),
        actor: { principalId: ADMIN, sessionId: state.value.session.id },
      }
      const reply = (domain.handle(request, 'normal') ?? devices.handle(request, 'normal'))!
      if (lost.path === o.path) {
        lost.path = ''
        throw networkErrorForTest()
      }
      if (reply.status !== o.successStatus) throw decodeMdmError(reply.status, reply.body)
      if (typeof o.decode !== 'function') return undefined
      const binary =
        o.responseType === 'arraybuffer'
          ? new ArrayBuffer((reply.body as ArrayBuffer).byteLength)
          : undefined
      if (binary) new Uint8Array(binary).set(new Uint8Array(reply.body as ArrayBuffer))
      return o.decode(
        o.responseType === 'arraybuffer'
          ? {
              bytes: binary,
              contentType: reply.headers?.['Content-Type'],
              contentDisposition: reply.headers?.['Content-Disposition'],
            }
          : reply.body,
      )
    },
  } as HttpTransport
  const runtime = {
    devices: createDeviceClients(transport, TENANT),
    onboarding: createOnboardingClients(transport, transport, TENANT, INSTANCE),
    session: { state },
    tenant: TENANT,
    demo: true,
    operations: {
      authorization: {
        effective: async () => ({
          principalId: ADMIN,
          tenantId: TENANT,
          instanceId: INSTANCE,
          grants: allow
            ? [
                'registration_configuration_read',
                'registration_configuration_write',
                'agent_enrollment_read',
                'agent_enrollment_write',
                'authorization_read',
                'authorization_write',
              ].map((operation) => ({ operation, scope: { kind: 'tenant' } }))
            : [],
        }),
      },
    },
  } as unknown as MdmRuntime
  runtime.registrationChannels = createRegistrationChannels(
    createRegistrationChannelsClient(transport, TENANT),
    runtime.session,
    runtime.operations.authorization,
    TENANT,
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/journey', component: view as never },
      {
        path: '/tenants/:tenant/devices/:device/management',
        name: 'device-management',
        component: defineComponent({ template: '<p>device</p>' }),
      },
      { path: '/other', component: defineComponent({ template: '<p>other</p>' }) },
      { path: '/downloads/agent', name: 'agent-downloads', component: DownloadsView },
    ],
  })
  await router.push('/journey')
  const create = vi.fn(() => 'blob:synthetic-delivery'),
    revoke = vi.fn()
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }))
  const wrapper = mount(RouterView, {
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      provide: {
        [mdmKey as symbol]: runtime,
        ...(targetEvidence
          ? { [enrollmentTargetKey as symbol]: createDemoEnrollmentTargetResolver(transport) }
          : {}),
      },
    },
  })
  wrapper.vm.$.appContext.app.onUnmount(() => runtime.registrationChannels.dispose())
  wrappers.push(wrapper)
  await flushPromises()
  async function click(text: string) {
    const button = wrapper.findAll('button').find((b) => b.text() === text)
    expect(button, `button ${text}`).toBeDefined()
    await button!.trigger('click')
    await flushPromises()
  }
  return { wrapper, runtime, domain, router, state, calls, lost, click, create, revoke }
}
it('keeps downloads anonymous and never requests or creates enrollment authority', async () => {
  const { wrapper, calls, runtime, click } = await setup(DownloadsView, false)
  expect(wrapper.text()).toContain('无需登录')
  expect(wrapper.findAll('a[download]')).toHaveLength(4)
  expect(
    wrapper
      .findAll('a[download]')
      .every((link) => link.attributes('download')?.startsWith('MOCK-NOT-AN-INSTALLER')),
  ).toBe(true)
  vi.spyOn(runtime.onboarding.packages, 'list').mockResolvedValue([])
  await click('重新读取')
  expect(wrapper.text()).toContain('没有已发布')
  expect(wrapper.findAll('a[download]')).toHaveLength(0)
  expect(wrapper.findAll('select')).toHaveLength(0)
  expect(
    wrapper
      .findAll('[data-download-target]')
      .map((target) => target.attributes('data-download-target')),
  ).toEqual(['windows/x86_64', 'windows/aarch64', 'macos/x86_64', 'macos/aarch64'])
  expect(calls).toEqual(['GET /api/v1/agent/enroll/packages'])
})
it('downloads all current published formats without requesting enrollment authority', async () => {
  const { wrapper, runtime, calls } = await setup(DownloadsView, false)
  const packages = (['windows_exe', 'windows_msi', 'windows_msix', 'macos_pkg'] as const).map(
    (format, i) => ({
      releaseId: `11111111-1111-4111-8111-11111111111${i}`,
      tenantId: TENANT,
      target: {
        platform: format === 'macos_pkg' ? ('macos' as const) : ('windows' as const),
        architecture: 'x86_64' as const,
      },
      version: '1.0.0',
      format,
      filename: `agent.${['exe', 'msi', 'msix', 'pkg'][i]}`,
      length: 42,
      installerSha256: Array<number>(32).fill(0),
    }),
  )
  vi.spyOn(runtime.onboarding.packages, 'list').mockResolvedValue(packages)
  await wrapper.find('button').trigger('click')
  await flushPromises()
  expect(wrapper.findAll('a[download]').map((link) => link.attributes('download'))).toEqual([
    'agent.exe',
    'agent.msi',
    'agent.msix',
    'agent.pkg',
  ])
  expect(calls).toEqual(['GET /api/v1/agent/enroll/packages'])
})
it('shows plaintext TOU with a native form, a join-specific decision and no RSS identity requests', async () => {
  const { wrapper, runtime, calls } = await setup(TermsView, false)
  const form = wrapper.find('form')
  expect(form.attributes('method')).toBe('post')
  expect(form.attributes('action')).toBe('/api/v1/windows/entra/terms/finish')
  expect(wrapper.find('input[type=hidden]').attributes('name')).toBe('csrfToken')
  expect(wrapper.find('button[value=false]').exists()).toBe(true)
  const context = await runtime.onboarding.entra.context()
  vi.spyOn(runtime.onboarding.entra, 'context').mockResolvedValue({
    ...context,
    termsText: '<img src=x onerror=alert(1)>',
    mode: 'azureadjoin',
    canDecline: false,
  })
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '重新读取')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
  expect(wrapper.find('button[value=false]').exists()).toBe(false)
  expect(calls.every((path) => path.includes('/windows/entra/terms/context'))).toBe(true)
})
it('clears expired TOU decisions and never constructs native callbacks', async () => {
  const { wrapper, runtime } = await setup(TermsView, false),
    context = await runtime.onboarding.entra.context()
  vi.spyOn(runtime.onboarding.entra, 'context').mockResolvedValue({ ...context, expiresAt: 1 })
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '重新读取')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.find('form').exists()).toBe(false)
  expect(wrapper.text()).toContain('流程已过期')
})
it('hides administrator configuration forms without authoritative permissions', async () => {
  const { wrapper, calls } = await setup(ConfigurationsView, false)
  expect(wrapper.find('form').exists()).toBe(false)
  expect(wrapper.text()).toContain('请求被拒绝')
  expect(calls).toEqual(['GET /api/v1/registration-channels'])
})
it('delivers complete JSON explicitly and revokes the Blob URL when leaving the page', async () => {
  const { wrapper, router, create, revoke, state } = await setup(ConfigurationsView)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  const link = wrapper.find('a[download="rss-agent-enrollment.json"]')
  expect(link.exists()).toBe(true)
  expect(create).toHaveBeenCalledTimes(1)
  state.value = { ...state.value, session: { ...state.value.session } }
  await flushPromises()
  expect(wrapper.find('a[download]').exists()).toBe(true)
  expect(revoke).not.toHaveBeenCalled()
  await router.push('/other')
  await flushPromises()
  expect(revoke).toHaveBeenCalledWith('blob:synthetic-delivery')
})
it('keeps null Unknown locked, finds metadata without secrets and revokes before creating a replacement', async () => {
  const { wrapper, runtime, lost, click, calls, state } = await setup(ConfigurationsView)
  lost.path = '/api/v1/agent-configurations'
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('提交结果未知')
  const originalOperation = wrapper.text()
  state.value = {
    ...state.value,
    identity: { ...state.value.identity },
    session: { ...state.value.session },
  }
  await flushPromises()
  expect(wrapper.text()).toContain('提交结果未知')
  expect(wrapper.text()).toBe(originalOperation)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(calls.filter((p) => p === 'POST /api/v1/agent-configurations')).toHaveLength(1)
  expect(wrapper.find('a[download]').exists()).toBe(false)
  const real = runtime.onboarding.configurations.operation,
    lookup = vi.spyOn(runtime.onboarding.configurations, 'operation').mockResolvedValueOnce(null)
  await click('查询原操作结果')
  expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined()
  lookup.mockImplementation(real)
  await click('查询原操作结果')
  expect(wrapper.text()).toContain('后端剩余数量')
  await click('确认撤销配置')
  expect(wrapper.find('fieldset').attributes('disabled')).toBeUndefined()
  expect(calls.filter((p) => p === 'POST /api/v1/agent-configurations')).toHaveLength(1)
  expect(calls.some((p) => p.endsWith('/revoke'))).toBe(true)
})
it('reads MAA organizations and saves distinct account bindings without copying bridge script', async () => {
  const { wrapper, click, runtime } = await setup(AppleAccountView)
  expect(wrapper.find(`a[href="${runtime.onboarding.apple.bridge}"]`).exists()).toBe(true)
  await click('生成新组织 ID')
  await wrapper.find('input[maxlength="253"]').setValue('example.test')
  const form = wrapper.find('form')
  const server = crypto.randomUUID()
  await form.findAll('input')[1]!.setValue(server)
  await form.findAll('input')[2]!.setValue('account')
  await form.trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('签名用途已配置')
  expect(wrapper.find('dl').text()).toContain(server)
  expect(wrapper.find('dl').text()).toContain('account')
  await wrapper.find('input[type=email]').setValue('managed@example.test')
  const mapping = wrapper.findAll('form')[1]!
  await mapping.findAll('input')[1]!.setValue(ADMIN)
  await mapping.findAll('input')[2]!.setValue(INSTANCE)
  await mapping.trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('managed@example.test')
  vi.spyOn(runtime.onboarding.apple, 'organizations').mockRejectedValueOnce(
    decodeMdmError(503, { code: 'unavailable' }),
  )
  const accounts = vi.spyOn(runtime.onboarding.apple, 'accounts')
  await click('重新读取')
  expect(wrapper.text()).toContain('服务暂不可用')
  expect(accounts).not.toHaveBeenCalled()
})
it('shows ADE states independently and reads configuration operations', async () => {
  const { wrapper, click, runtime } = await setup(AppleAdeView),
    id = crypto.randomUUID()
  await wrapper.get('[data-testid=organization-id] input').setValue(id)
  await flushPromises()
  const configuration = wrapper.find('form')
  await configuration.findAll('input')[0]!.setValue(crypto.randomUUID())
  await configuration.findAll('input')[1]!.setValue('ORG')
  await configuration.trigger('submit')
  await flushPromises()
  expect((await runtime.onboarding.apple.ade(id)).tokenState).toBe('missing')
  await click('重新读取')
  expect(wrapper.text()).toContain('尚未导入')
  expect(wrapper.text()).toContain('不代表已注册')
  expect(wrapper.findAll('input[type=checkbox]').length).toBeGreaterThan(10)
})
it('edits Entra plaintext and refuses same-version text changes', async () => {
  const { wrapper, runtime } = await setup(WindowsEntraView),
    form = wrapper.find('form')
  await form.findAll('input[type=checkbox]')[0]!.setValue(true)
  await form.findAll('input[type=checkbox]')[1]!.setValue(true)
  await form.find('input[maxlength="128"]').setValue('v1')
  await form.find('textarea').setValue('Corporate terms')
  await form.trigger('submit')
  await flushPromises()
  expect((await runtime.onboarding.entra.policy()).policy.termsText).toBe('Corporate terms')
  await form.find('textarea').setValue('Changed terms')
  await form.trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('冲突')
})

it('initializes the complete Entra draft after a session binding changes', async () => {
  const { wrapper, runtime, state } = await setup(WindowsEntraView)
  const first = await runtime.onboarding.entra.policy()
  await runtime.onboarding.entra.save(first.revision, crypto.randomUUID(), {
    enabled: true,
    allUsers: true,
    users: [],
    termsVersion: 'next-version',
    termsText: 'Next session terms',
    allowBackground: true,
  })
  await wrapper.find('form input[maxlength="128"]').setValue('stale-version')
  state.value = { ...state.value, session: { id: crypto.randomUUID() } }
  await flushPromises()
  expect((wrapper.get('form input[maxlength="128"]').element as HTMLInputElement).value).toBe(
    'next-version',
  )
  expect((wrapper.get('form textarea').element as HTMLTextAreaElement).value).toBe(
    'Next session terms',
  )
  expect(
    wrapper
      .findAll('form input[type=checkbox]')
      .every((input) => (input.element as HTMLInputElement).checked),
  ).toBe(true)
})

it('selects only tenant-enabled targets in a macOS-only configuration', async () => {
  const { wrapper, runtime, click } = await setup(ConfigurationsView)
  const settings = await runtime.onboarding.configurations.settings()
  await runtime.onboarding.configurations.saveSettings(crypto.randomUUID(), settings.revision, {
    ...settings.values,
    platforms: ['macos'],
  })
  await click('重新读取当前权限')
  const create = vi.spyOn(runtime.onboarding.configurations, 'create')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(create.mock.calls[0]?.[0].targets).toEqual([{ platform: 'macos', architecture: 'x86_64' }])
  expect(wrapper.find('a[download]').exists()).toBe(true)
})
it('explicitly retries an uncommitted unknown revocation with the original target and operation', async () => {
  const { wrapper, runtime, click, state } = await setup(ConfigurationsView)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  await wrapper.findAll('form')[1]!.trigger('submit')
  await flushPromises()
  const revoke = vi
    .spyOn(runtime.onboarding.configurations, 'revoke')
    .mockRejectedValueOnce(networkErrorForTest())
  await click('确认撤销配置')
  expect(wrapper.text()).toContain('提交结果未知')
  state.value = { ...state.value, session: { ...state.value.session } }
  await flushPromises()
  await click('查询原操作结果')
  expect(wrapper.text()).toContain('available')
  expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined()
  await click('显式重试原撤销操作')
  expect(revoke.mock.calls).toHaveLength(2)
  expect(revoke.mock.calls[1]).toEqual(revoke.mock.calls[0])
  expect(wrapper.text()).toContain('revoked')
  expect(wrapper.find('fieldset').attributes('disabled')).toBeUndefined()
})
it('discards a rejected revocation before reading and revoking a different configuration', async () => {
  const { wrapper, runtime, click } = await setup(ConfigurationsView)
  const create = vi.spyOn(runtime.onboarding.configurations, 'create')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  const idInput = wrapper.findAll('form')[1]!.find('input')
  const originalId = (idInput.element as HTMLInputElement).value
  const replacement = await runtime.onboarding.configurations.create({
    ...create.mock.calls[0]![0],
    operationId: crypto.randomUUID(),
    secret: generateEnrollmentPassword(),
  })
  await wrapper.findAll('form')[1]!.trigger('submit')
  await flushPromises()
  const revoke = vi
    .spyOn(runtime.onboarding.configurations, 'revoke')
    .mockRejectedValueOnce(decodeMdmError(403, { code: 'permission_denied' }))
  await click('确认撤销配置')
  expect(wrapper.text()).toContain('请求被拒绝')
  expect(wrapper.text()).not.toContain('提交结果未知')
  expect(wrapper.text()).not.toContain('显式重试原撤销操作')
  const replacementId = replacement.configuration.configurationId
  await idInput.setValue(replacementId)
  await wrapper.findAll('form')[1]!.trigger('submit')
  await flushPromises()
  await click('确认撤销配置')
  expect(revoke.mock.calls.map(([id]) => id)).toEqual([originalId, replacementId])
  expect((await runtime.onboarding.configurations.read(originalId)).state).toBe('available')
  expect((await runtime.onboarding.configurations.read(replacementId)).state).toBe('revoked')
  new Uint8Array(replacement.file.bytes).fill(0)
})
it('preserves explicit ADE profile choices and records sync and assignment as independent external operations', async () => {
  const { wrapper, runtime, domain, click } = await setup(AppleAdeView),
    id = crypto.randomUUID()
  await wrapper.get('[data-testid=organization-id] input').setValue(id)
  await flushPromises()
  const config = wrapper.find('form')
  await config.findAll('input')[0]!.setValue(crypto.randomUUID())
  await config.findAll('input')[1]!.setValue('ORG-EXAMPLE')
  await config.findAll('input[type=checkbox]')[0]!.setValue(true)
  await config.findAll('input[type=checkbox]')[1]!.setValue(true)
  await config.trigger('submit')
  await flushPromises()
  await click('重新读取')
  const command = vi.spyOn(runtime.onboarding.apple, 'command'),
    profileId = crypto.randomUUID()
  const name = wrapper.get('input[maxlength="128"]'),
    profile = new (await import('@vue/test-utils')).DOMWrapper(name.element.closest('form')!)
  await profile.findAll('input')[0]!.setValue(profileId)
  await name.setValue('Custom Setup')
  await profile.findAll('input[type=checkbox]')[1]!.setValue(true)
  await profile.findAll('input[type=checkbox]')[0]!.setValue(false)
  await profile.get('input[value=AppleID]').setValue(true)
  await profile.get('input[value=Privacy]').setValue(true)
  await profile.trigger('submit')
  await flushPromises()
  expect(command.mock.calls[0]?.[2]).toEqual({
    kind: 'profile',
    id: profileId,
    expectedRevision: 0,
    configuration: {
      name: 'Custom Setup',
      mandatory: false,
      removable: true,
      skip: ['AppleID', 'Privacy'],
    },
  })
  expect((await runtime.onboarding.apple.profiles(id)).items[0]?.remoteUuid).toBeNull()
  domain.tick()
  await click('查询原操作结果')
  await click('重新读取')
  await wrapper
    .findAll('button')
    .find((b) => b.text().startsWith('Custom Setup ·'))!
    .trigger('click')
  await flushPromises()
  const sync = wrapper
    .findAll('form')
    .find((f) => f.findAll('label').some((l) => l.text().includes('完整同步')))!
  await sync.get('input[type=checkbox]').setValue(true)
  await sync.trigger('submit')
  await flushPromises()
  expect(command.mock.calls.at(-1)?.[2]).toEqual({ kind: 'sync', full: true })
  domain.tick()
  await click('查询原操作结果')
  await click('重新读取')
  const assignment = wrapper.findAll('form').find((f) => f.find('textarea').exists())!
  await assignment.get('textarea').setValue('SERIAL-ONE\nSERIAL-TWO')
  await assignment.trigger('submit')
  await flushPromises()
  expect(command.mock.calls.at(-1)?.[2]).toEqual({
    kind: 'assign',
    profile: profileId,
    revision: 1,
    devices: ['SERIAL-ONE', 'SERIAL-TWO'],
  })
  domain.tick()
  await click('查询原操作结果')
  expect(wrapper.text()).toContain('不代表已注册')
  expect(wrapper.text()).toContain('external_outcome_unknown')
})

it('blocks paused configuration creates in the handler while preserving settings reads and queries', async () => {
  const { wrapper, runtime, calls } = await setup(ConfigurationsView)
  await runtime.registrationChannels.change('agent', 'paused')
  await flushPromises()
  const create = vi.spyOn(runtime.onboarding.configurations, 'create')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(create).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('暂停新注册')
  expect(calls.some((p) => p === 'GET /api/v1/agent-enrollment-settings')).toBe(true)
  expect(await runtime.onboarding.configurations.operation(crypto.randomUUID())).toBeNull()
})

it('does not revoke the previous configuration after a directory selection fails to read', async () => {
  const { wrapper, runtime, click } = await setup(ConfigurationsView)
  const create = vi.spyOn(runtime.onboarding.configurations, 'create')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  await wrapper.findAll('form')[1]!.trigger('submit')
  await flushPromises()
  const replacement = await runtime.onboarding.configurations.create({
    ...create.mock.calls[0]![0],
    operationId: crypto.randomUUID(),
    secret: generateEnrollmentPassword(),
  })
  await click('重新读取')
  const read = vi
    .spyOn(runtime.onboarding.configurations, 'read')
    .mockRejectedValueOnce(decodeMdmError(403, { code: 'permission_denied' }))
  const revoke = vi.spyOn(runtime.onboarding.configurations, 'revoke')
  await click(replacement.configuration.configurationId)
  expect(read).toHaveBeenCalledWith(replacement.configuration.configurationId)
  expect(wrapper.findAll('button').some((button) => button.text() === '确认撤销配置')).toBe(false)
  expect(revoke).not.toHaveBeenCalled()
  new Uint8Array(replacement.file.bytes).fill(0)
})

it('authorizes macOS profile delivery, clears the submitted secret and withdraws the file after cancellation', async () => {
  const id = crypto.randomUUID()
  const current = shallowRef(
    decodeEnrollment(
      {
        enrollmentId: id,
        status: 'pending',
        expiresAt: Math.floor(Date.now() / 1000) + 300,
        registrationId: null,
        source: 'mdm.apple',
        instructions: {
          platform: 'macos',
          profileUrl: `/api/v1/enrollments/${id}/profile`,
          enrollmentMethod: 'profile_based_device_enrollment',
        },
        progress: {
          profilePrepared: 'unknown',
          certificateIssued: false,
          firstAuthenticatedCheckIn: false,
          systemConfirmation: 'unknown',
          managementReady: false,
          diagnostic: 'awaiting_certificate',
        },
      },
      id,
    ),
  )
  const host = defineComponent({ setup: () => () => h(NativeFacts, { value: current.value }) })
  const { wrapper, runtime, revoke } = await setup(host)
  await runtime.registrationChannels.refresh()
  const bytes = new Uint8Array([1, 2, 3])
  const profile = vi.spyOn(runtime.onboarding.native, 'profile').mockResolvedValue({
    bytes: bytes.buffer,
    contentType: 'application/x-apple-aspen-config',
    contentDisposition: 'attachment',
  })
  await wrapper.get('button').trigger('click')
  await flushPromises()
  const password = wrapper.get('input[type=password]')
  await password.setValue('A'.repeat(43))
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(profile).toHaveBeenCalledWith(id, 'A'.repeat(43))
  expect((password.element as HTMLInputElement).value).toBe('')
  expect(bytes.every((byte) => byte === 0)).toBe(true)
  expect(wrapper.find('a[download="RSS-MDM.mobileconfig"]').exists()).toBe(true)
  expect(wrapper.text()).toContain('等待证书')
  current.value = { ...current.value, status: 'cancelled' }
  await flushPromises()
  expect(wrapper.find('a[download]').exists()).toBe(false)
  expect(revoke).toHaveBeenCalledWith('blob:synthetic-delivery')
})

async function prepareGuide(
  fixture: Awaited<ReturnType<typeof setup>>,
  platform: 'Windows' | 'macOS' = 'Windows',
) {
  const copy = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } })
  if (platform === 'macOS') await fixture.click('macOS')
  await fixture.click('继续准备注册')
  const secret = fixture.wrapper.get('[data-enrollment-secret]').text()
  expect(secret).toHaveLength(43)
  expect(fixture.wrapper.find('input[autocomplete=off]').exists()).toBe(false)
  return { secret, copy }
}
it('automatically delivers a macOS profile after its confirmed receipt without retaining or reentering the password', async () => {
  const fixture = await setup(SelfEnrollmentView),
    { wrapper, runtime, click, revoke, state } = fixture
  const { secret, copy } = await prepareGuide(fixture, 'macOS')
  const bytes = new Uint8Array([1, 2, 3])
  const profile = vi
    .spyOn(runtime.onboarding.native, 'profile')
    .mockImplementation(async (_id, password) => {
      expect(wrapper.find('[data-enrollment-secret]').exists()).toBe(false)
      expect(password).toBe(secret)
      return {
        bytes: bytes.buffer,
        contentType: 'application/x-apple-aspen-config',
        contentDisposition: 'attachment',
      }
    })
  const enroll = vi.spyOn(runtime.devices.registration, 'enroll')
  await click('复制口令并继续')
  expect(enroll).toHaveBeenCalledTimes(1)
  expect(copy).toHaveBeenCalledWith(secret)
  expect(profile).toHaveBeenCalledWith((await enroll.mock.results[0]!.value).enrollmentId, secret)
  expect(wrapper.find('a[download="RSS-MDM.mobileconfig"]').exists()).toBe(true)
  expect(wrapper.find('input[type=password]').exists()).toBe(false)
  expect(bytes.every((byte) => byte === 0)).toBe(true)
  state.value = { ...state.value, session: { id: crypto.randomUUID() } }
  await flushPromises()
  expect(wrapper.find('a[download]').exists()).toBe(false)
  expect(revoke).toHaveBeenCalledWith('blob:synthetic-delivery')
})
it('keeps a confirmed macOS enrollment confirmed when profile delivery fails and retries only the profile explicitly', async () => {
  const fixture = await setup(SelfEnrollmentView),
    { wrapper, runtime, click } = fixture
  const { secret } = await prepareGuide(fixture, 'macOS')
  const enroll = vi.spyOn(runtime.devices.registration, 'enroll')
  const profile = vi
    .spyOn(runtime.onboarding.native, 'profile')
    .mockRejectedValueOnce(networkErrorForTest())
  await click('复制口令并继续')
  expect(wrapper.text()).toContain('注册授权已确认，但描述文件交付未完成')
  expect(wrapper.text()).not.toContain('原注册请求的结果未知')
  expect(enroll).toHaveBeenCalledTimes(1)
  expect(wrapper.find('[data-enrollment-secret]').exists()).toBe(false)
  profile.mockResolvedValue({
    bytes: new Uint8Array([1, 2]).buffer,
    contentType: 'application/x-apple-aspen-config',
    contentDisposition: 'attachment',
  })
  await wrapper.get('input[type=password]').setValue(secret)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(enroll).toHaveBeenCalledTimes(1)
  expect(profile.mock.calls[1]).toEqual(profile.mock.calls[0])
  expect(wrapper.find('a[download="RSS-MDM.mobileconfig"]').exists()).toBe(true)
  expect(wrapper.find('input[type=password]').exists()).toBe(false)
})
it('uses the saved original password for an explicit unknown create replay and never requests a profile before a confirmed receipt', async () => {
  const fixture = await setup(SelfEnrollmentView),
    { wrapper, runtime, click, lost } = fixture
  const { secret } = await prepareGuide(fixture, 'macOS')
  const enroll = vi.spyOn(runtime.devices.registration, 'enroll')
  const profile = vi.spyOn(runtime.onboarding.native, 'profile').mockResolvedValue({
    bytes: new Uint8Array([1]).buffer,
    contentType: 'application/x-apple-aspen-config',
    contentDisposition: 'attachment',
  })
  lost.path = '/api/v1/self-enrollments'
  await click('复制口令并继续')
  expect(wrapper.text()).toContain('原注册请求的结果未知')
  expect(profile).not.toHaveBeenCalled()
  expect(wrapper.find('[data-enrollment-secret]').exists()).toBe(false)
  await wrapper.get('input[type=password]').setValue(secret)
  await wrapper.get('input[type=checkbox]').setValue(true)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(enroll.mock.calls[1]).toEqual(enroll.mock.calls[0])
  expect(profile).toHaveBeenCalledTimes(1)
  expect(wrapper.find('a[download="RSS-MDM.mobileconfig"]').exists()).toBe(true)
})
it('requires an explicit saved-password action when clipboard delivery is unavailable', async () => {
  const fixture = await setup(SelfEnrollmentView),
    { wrapper, runtime, click } = fixture
  const { secret, copy } = await prepareGuide(fixture)
  const enroll = vi.spyOn(runtime.devices.registration, 'enroll')
  copy.mockRejectedValueOnce(new Error('Unavailable'))
  await click('复制口令并继续')
  expect(enroll).not.toHaveBeenCalled()
  expect(wrapper.get('[data-enrollment-secret]').text()).toBe(secret)
  await click('已安全保存口令，继续')
  expect(enroll).toHaveBeenCalledTimes(1)
  expect(wrapper.find('[data-enrollment-secret]').exists()).toBe(false)
})
it('withdraws a late automatic profile response after navigation and clears its bytes', async () => {
  const fixture = await setup(SelfEnrollmentView),
    { wrapper, runtime, click, router, create } = fixture
  await prepareGuide(fixture, 'macOS')
  const bytes = new Uint8Array([1, 2, 3])
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const profile = vi.spyOn(runtime.onboarding.native, 'profile').mockImplementation(async () => {
    await gate
    return {
      bytes: bytes.buffer,
      contentType: 'application/x-apple-aspen-config',
      contentDisposition: 'attachment',
    }
  })
  await click('复制口令并继续')
  expect(profile).toHaveBeenCalledTimes(1)
  expect(wrapper.find('[data-enrollment-secret]').exists()).toBe(false)
  await router.push('/other')
  release()
  await flushPromises()
  expect(create).not.toHaveBeenCalled()
  expect(bytes.every((byte) => byte === 0)).toBe(true)
})

it('keeps formal-status progress and cancellation in the guide without inventing a device binding', async () => {
  const fixture = await setup(SelfEnrollmentView, true, false)
  const enroll = vi.spyOn(fixture.runtime.devices.registration, 'enroll')
  await prepareGuide(fixture)
  await fixture.click('复制口令并继续')
  const receipt = await enroll.mock.results[0]!.value
  expect(fixture.wrapper.text()).toContain('设备详情关联暂未接通')
  expect(fixture.wrapper.find('a[href*=management]').exists()).toBe(false)
  expect(fixture.wrapper.findComponent(NativeFacts).exists()).toBe(true)
  expect(await fixture.runtime.devices.enrollment.status(receipt.enrollmentId)).not.toHaveProperty(
    'deviceId',
  )
  const cancel = vi.spyOn(fixture.runtime.devices.enrollment, 'cancel')
  await fixture.click('无法继续？恢复原注册')
  await fixture.click('取消')
  expect(cancel.mock.calls[0]?.[0]).toBe(receipt.enrollmentId)
  expect(fixture.wrapper.text()).toContain('已取消')
  expect(
    fixture.calls.some((call) => call.includes('mdm-candidate/devices/self-enrollments')),
  ).toBe(false)
})

it('keeps unknown resume inputs usable after a failed status refresh and explicitly replays the original request', async () => {
  const id = shallowRef('')
  const fixture = await setup(
    defineComponent({
      setup: () => () => (id.value ? h(SelfEnrollmentProgress, { enrollmentId: id.value }) : null),
    }),
  )
  const { wrapper, runtime, click } = fixture
  const receipt = await runtime.devices.registration.enroll(
    crypto.randomUUID(),
    'A'.repeat(43),
    'mdm.windows',
    'Full',
  )
  id.value = receipt.enrollmentId
  await flushPromises()
  await wrapper
    .findAll('.v-expansion-panel-title')
    .find((button) => button.text().includes('无法继续？恢复原注册'))!
    .trigger('click')
  await flushPromises()
  await click('生成一次性交付口令')
  const secret = wrapper.get<HTMLInputElement>('input[autocomplete=off]').element.value
  await wrapper.get('input[type=checkbox]').setValue(true)
  const resume = vi
    .spyOn(runtime.devices.enrollment, 'resume')
    .mockRejectedValueOnce(networkErrorForTest())
  await click('更新口令并继续')
  expect(resume).toHaveBeenCalledTimes(1)
  vi.spyOn(runtime.devices.enrollment, 'status').mockRejectedValueOnce(
    decodeMdmError(503, { code: 'unavailable' }),
  )
  await click('重新读取')
  expect(wrapper.text()).toContain('服务暂不可用')
  expect(wrapper.find('input[autocomplete=off]').exists()).toBe(true)
  await wrapper.get('input[autocomplete=off]').setValue(secret)
  await wrapper.get('input[type=checkbox]').setValue(true)
  await click('明确重放原操作')
  expect(resume).toHaveBeenCalledTimes(2)
  expect(resume.mock.calls[1]).toEqual(resume.mock.calls[0])
  expect(wrapper.text()).not.toContain('提交结果未知')
})

it('revokes an automatically delivered macOS profile when its password is rotated and offers a new profile read', async () => {
  const fixture = await setup(SelfEnrollmentView)
  const { wrapper, runtime, click, revoke, create } = fixture
  await prepareGuide(fixture, 'macOS')
  const profile = vi.spyOn(runtime.onboarding.native, 'profile').mockImplementation(async () => ({
    bytes: new Uint8Array([1, 2, 3]).buffer,
    contentType: 'application/x-apple-aspen-config',
    contentDisposition: 'attachment',
  }))
  await click('复制口令并继续')
  expect(wrapper.find('a[download="RSS-MDM.mobileconfig"]').exists()).toBe(true)
  await wrapper
    .findAll('.v-expansion-panel-title')
    .find((button) => button.text().includes('无法继续？恢复原注册'))!
    .trigger('click')
  await flushPromises()
  const progress = wrapper.findComponent(SelfEnrollmentProgress)
  await progress.get('.v-expansion-panel-title').trigger('click')
  await flushPromises()
  await click('生成一次性交付口令')
  const secret = progress.get<HTMLInputElement>('input[autocomplete=off]').element.value
  await progress.get('input[type=checkbox]').setValue(true)
  await click('更新口令并继续')
  expect(revoke).toHaveBeenCalledWith('blob:synthetic-delivery')
  expect(wrapper.find('a[download="RSS-MDM.mobileconfig"]').exists()).toBe(false)
  expect(profile).toHaveBeenCalledTimes(1)
  await click('使用已保存口令重新获取描述文件')
  const input = wrapper.get('input[type=password]')
  await input.setValue(secret)
  await new (await import('@vue/test-utils')).DOMWrapper(input.element.closest('form')!).trigger(
    'submit',
  )
  await flushPromises()
  expect(profile.mock.calls[1]?.[1]).toBe(secret)
  expect(create).toHaveBeenCalledTimes(2)
  expect(wrapper.find('a[download="RSS-MDM.mobileconfig"]').exists()).toBe(true)
})
