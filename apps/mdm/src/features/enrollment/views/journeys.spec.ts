import { defineComponent, shallowRef } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import type { HttpTransport, RequestOptions, NoContentRequest } from '@rss/api/mdm'
import { decodeMdmError } from '@rss/api/mdm'
import { networkErrorForTest } from '@rss/api/testing'
import { mdmKey, type MdmRuntime } from '../../../context'
import { mdmI18n } from '../../../i18n'
import { createOnboardingClients } from '../client'
import { createOnboardingDemo } from '../../../../demo/enrollment'
import { ADMIN, INSTANCE } from '../../../../demo/operations/authorization'
import { TENANT } from '../../../../demo/scenario'
import { operationsFeature } from '../../operations/routes'
import { deviceFeature } from '../../devices/routes'
import ConfigurationsView from './ConfigurationsView.vue'
import TermsView from './TermsView.vue'
import DownloadsView from './DownloadsView.vue'
import AppleAccountView from './AppleAccountView.vue'
import AppleAdeView from './AppleAdeView.vue'
import WindowsEntraView from './WindowsEntraView.vue'
const wrappers: VueWrapper[] = []
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})
async function setup(view: unknown, allow = true) {
  const domain = createOnboardingDemo(() => allow),
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
      const reply = domain.handle(
        {
          method: o.method,
          path,
          body: o.body,
          query: new URLSearchParams(),
          headers: Object.fromEntries(
            Object.entries(o.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
          ),
          actor: { principalId: ADMIN, sessionId: state.value.session.id },
        },
        'normal',
      )!
      if (lost.path === o.path) {
        lost.path = ''
        throw networkErrorForTest()
      }
      if (reply.status !== o.successStatus) throw decodeMdmError(reply.status, reply.body)
      if (o.successStatus === 204) return undefined
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
    onboarding: createOnboardingClients(transport, transport, TENANT),
    session: { state },
    tenant: TENANT,
    demo: true,
    operations: {
      authorization: {
        effective: async () => ({
          principalId: ADMIN,
          grants: allow
            ? [
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
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/journey', component: view as never },
      { path: '/other', component: defineComponent({ template: '<p>other</p>' }) },
      deviceFeature.entry,
      ...(deviceFeature.routes ?? []),
      operationsFeature.entry,
      ...(operationsFeature.routes ?? []),
      { path: '/downloads/agent', name: 'agent-downloads', component: DownloadsView },
    ],
  })
  await router.push('/journey')
  const create = vi.fn(() => 'blob:synthetic-delivery'),
    revoke = vi.fn()
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }))
  const wrapper = mount(RouterView, {
    attachTo: document.body,
    global: { plugins: [router, mdmI18n()], provide: { [mdmKey as symbol]: runtime } },
  })
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
  const { wrapper, calls } = await setup(DownloadsView, false)
  expect(wrapper.text()).toContain('无需登录')
  expect(wrapper.text()).toContain('没有正式发布')
  expect(wrapper.findAll('select')).toHaveLength(3)
  expect(calls).toEqual(['GET /api/v1/agent/enroll/packages'])
  await wrapper.findAll('select')[0]!.setValue('macos')
  expect(calls).toHaveLength(1)
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
  expect(calls).toEqual([])
})
it('delivers complete JSON explicitly and revokes the Blob URL when leaving the page', async () => {
  const { wrapper, router, create, revoke } = await setup(ConfigurationsView)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  const link = wrapper.find('a[download="rss-agent-enrollment.json"]')
  expect(link.exists()).toBe(true)
  expect(create).toHaveBeenCalledTimes(1)
  await router.push('/other')
  await flushPromises()
  expect(revoke).toHaveBeenCalledWith('blob:synthetic-delivery')
})
it('keeps null Unknown locked, finds metadata without secrets and revokes before creating a replacement', async () => {
  const { wrapper, runtime, lost, click, calls } = await setup(ConfigurationsView)
  lost.path = '/api/v1/agent-configurations'
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('提交结果未知')
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
})
it('shows ADE states independently and reads configuration operations', async () => {
  const { wrapper, click, runtime } = await setup(AppleAdeView),
    id = crypto.randomUUID()
  const fields = wrapper.findAll('input')
  await fields[0]!.setValue(id)
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
