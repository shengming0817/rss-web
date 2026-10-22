import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, shallowRef, type Component } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { IdentitySession } from '@rss/auth'
import type { HttpTransport, RequestOptions, NoContentRequest } from '@rss/api/mdm'
import { decodeMdmError } from '@rss/api/mdm'
import { mdmKey, type MdmRuntime } from '../../../context'
import { mdmI18n } from '../../../i18n'
import { useSettingsAction } from '../useSettingsAction'
import { createSettingsClients } from '../client'
import {
  createAuthorizationClient,
  permissions,
  devicePermissions,
} from '../../operations/clients/authorization'
import UserAttributeEditor from '../components/UserAttributeEditor.vue'
import ProfilePanel from '../components/ProfilePanel.vue'
import ApplePanel from '../components/ApplePanel.vue'
import ProviderPanel from '../components/ProviderPanel.vue'
import TaskTrustPanel from '../components/TaskTrustPanel.vue'
import WebhookPanel from '../components/WebhookPanel.vue'
import PkiPanel from '../components/PkiPanel.vue'
import PackagesPanel from '../components/PackagesPanel.vue'
import PackageUpload from '../components/PackageUpload.vue'
import TenantEditor from '../components/TenantEditor.vue'
import FirstUseView from './FirstUseView.vue'
import type { FirstUseIntent } from '../clients/firstUse'
import TenantsView from './TenantsView.vue'
import OperationsPanel from '../components/OperationsPanel.vue'
import DeploymentPanel from '../components/DeploymentPanel.vue'
const tenant = '11111111-1111-4111-8111-111111111111',
  principal = '22222222-2222-4222-8222-222222222222',
  id = '33333333-3333-4333-8333-333333333333',
  digest = 'a'.repeat(64)
const wrappers: VueWrapper[] = [],
  dispose: (() => void)[] = []
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  dispose.splice(0).forEach((f) => f())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const row = {
  tenantId: tenant,
  management: false,
  initialEpoch: 1,
  currentEpoch: 1,
  name: 'Team',
  notes: null,
  revision: 1,
  deletable: true,
}
const provision = (operationId: string) => ({
  operationId,
  action: 'provision',
  result: {
    operationId,
    tenantId: tenant,
    administratorId: principal,
    hostId: id,
    revision: 1,
    phase: 'host_pending',
    blocked: 'capacity',
    origin: null,
    application: null,
  },
})
type Options = RequestOptions<unknown> | NoContentRequest
async function guideStep(wrapper: VueWrapper, label: string) {
  await wrapper
    .findAll('button')
    .find((b) => b.text().includes(label))!
    .trigger('click')
  await flushPromises()
}
async function fixture(
  component: Component,
  props: object = {},
  realm: 'tenant' | 'platform' = 'tenant',
  name = 'test',
) {
  const state = shallowRef({
      status: 'authenticated',
      tenant,
      identity: { principalId: principal },
      session: { id },
    }),
    session = { state } as unknown as IdentitySession
  let handler: ((o: Options) => unknown | Promise<unknown>) | undefined
  const calls: Options[] = []
  const transport = {
    async request(o: Options) {
      calls.push(o)
      let value: unknown
      if (o.path.endsWith('/authorization'))
        value = {
          instanceId: id,
          tenantId: tenant,
          principalId: principal,
          grants: permissions.map((operation) => ({
            ruleId: id,
            ruleRevision: 1,
            subject: {
              kind: 'user',
              user: { instanceId: id, tenantId: tenant, principalId: principal },
            },
            operation,
            scope: {
              kind: (devicePermissions as readonly string[]).includes(operation)
                ? 'all_devices'
                : 'tenant',
            },
            observation: null,
          })),
        }
      else if (handler) value = await handler(o)
      else if (o.path.includes('/settings/catalog')) value = { items: [], domains: [] }
      else if (o.path === '/api/v1/tenant-administration/tenants') value = { items: [] }
      else if (o.path === '/api/v1/tenant-administration/provisionings')
        value = { items: [], nextAfter: null }
      else if (o.path.startsWith('/api/v1/apple/materials/'))
        value = {
          revision: 0,
          desiredRevision: null,
          versions: [],
          runtimeObservation: 'separate',
          accountBindings: {},
        }
      else if (o.path === '/api/v1/smtp')
        value = { revision: 0, selectedRevision: null, versions: [] }
      else if (o.path === '/api/v1/windows/wns' || o.path === '/api/v1/storage/connections')
        value = { revision: 0, desiredRevision: null, versions: [] }
      else if (o.path === '/api/v1/webhooks/materials')
        value = { configurationSha256: digest, keys: { heads: [], materials: [] } }
      else if (o.path === '/api/v1/agent-packages') value = []
      else throw decodeMdmError(503, { code: 'service_unavailable' })
      return typeof o.decode === 'function' ? o.decode(value) : undefined
    },
  } as HttpTransport
  const settings = createSettingsClients(transport, transport, session, tenant, realm)
  const runtime = {
    tenant,
    businessTenant: tenant,
    managementTenant: id,
    realm,
    demo: false,
    session,
    settings,
    operations: { authorization: createAuthorizationClient(transport, tenant, realm) },
  } as unknown as MdmRuntime
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name, component },
      { path: '/workspace', name: 'workspace', component: { template: '<p>Workspace</p>' } },
      { path: '/next', name: 'next', component: { template: '<p>Next</p>' } },
    ],
  })
  await router.push('/')
  const options = {
    props,
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      provide: { [mdmKey as symbol]: runtime },
      stubs: { RouterLink: { template: '<a><slot/></a>' } },
    },
  }
  let wrapper = mount(component, options)
  wrappers.push(wrapper)
  dispose.push(() => settings.operations.dispose())
  await flushPromises()
  return {
    get wrapper() {
      return wrapper
    },
    async remount() {
      const destination = router.currentRoute.value.fullPath
      wrapper.unmount()
      await router.push(destination)
      wrappers.splice(wrappers.indexOf(wrapper), 1)
      wrapper = mount(component, options)
      wrappers.push(wrapper)
      await flushPromises()
    },
    calls,
    state,
    settings,
    router,
    setHandler(value: typeof handler) {
      handler = value
    },
  }
}
function button(w: VueWrapper, label: string) {
  return w.findAll('button').find((b) => b.text() === label)!
}
it('clears imported private keys immediately, keeps unknown writes across remount and queries before exact replay', async () => {
  const f = await fixture(ApplePanel, { purpose: 'apns' })
  await f.wrapper.get('select').setValue('import')
  await f.wrapper.get('textarea').setValue('PRIVATE INPUT')
  let original = ''
  f.setHandler((o) => {
    if (o.method === 'POST') {
      original = o.headers!['Idempotency-Key']!
      throw decodeMdmError(503, { code: 'operation_unknown' })
    }
    if (o.path.includes('material-operations'))
      throw decodeMdmError(404, { code: 'operation_not_found' })
    return {
      revision: 0,
      desiredRevision: null,
      versions: [],
      runtimeObservation: 'separate',
      accountBindings: {},
    }
  })
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect((f.wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('')
  expect(JSON.stringify([...f.settings.operations.records.values()])).not.toContain('PRIVATE INPUT')
  expect(button(f.wrapper, '按原输入显式重试').attributes('disabled')).toBeDefined()
  await button(f.wrapper, '重新读取').trigger('click')
  await flushPromises()
  expect(f.settings.operations.records.get('apns')?.state).toBe('unknown')
  await f.remount()
  await f.wrapper.get('select').setValue('import')
  await button(f.wrapper, '查询原操作').trigger('click')
  await flushPromises()
  expect(button(f.wrapper, '按原输入显式重试').attributes('disabled')).toBeUndefined()
  await f.wrapper.get('textarea').setValue('PRIVATE INPUT')
  f.setHandler((o) =>
    o.method === 'POST'
      ? {
          operationId: original,
          revision: 1,
          state: 'awaiting_certificate',
          keyId: id,
          csr: 'PUBLIC CSR',
          publicKeyDigest: digest,
        }
      : {
          revision: 1,
          desiredRevision: null,
          versions: [],
          runtimeObservation: 'separate',
          accountBindings: {},
        },
  )
  await button(f.wrapper, '按原输入显式重试').trigger('click')
  await flushPromises()
  const writes = f.calls.filter((o) => o.method === 'POST')
  expect(writes).toHaveLength(2)
  expect(writes[1]?.headers?.['Idempotency-Key']).toBe(original)
  expect(f.settings.operations.records.get('apns')?.state).toBe('received')
  f.state.value = { ...f.state.value, session: { id: principal } }
  await flushPromises()
  expect(f.settings.operations.records.size).toBe(0)
})
it.each(['storage', 'smtp', 'wns'] as const)(
  'submits typed %s credentials without retaining secrets and separates qualification from application',
  async (kind) => {
    const f = await fixture(ProviderPanel, { kind })
    for (const input of f.wrapper.findAll('input'))
      await input.setValue(
        input.attributes('type') === 'email'
          ? 'fixture@example.test'
          : input.attributes('type') === 'number'
            ? '123'
            : input.attributes('type') === 'password'
              ? 'fixture-secret'
              : 'approved',
      )
    f.setHandler((o) => {
      const operationId = o.headers?.['Idempotency-Key']
      if (o.method === 'POST') {
        if (kind === 'storage')
          return {
            operationId,
            revision: 1,
            profile: 'approved',
            state: 'pending',
            failureReason: null,
            selected: false,
            revoked: false,
            qualifiedAt: null,
            expiresAt: null,
          }
        if (kind === 'smtp')
          return {
            operationId,
            revision: 1,
            profile: 'approved',
            state: 'pending',
            attemptedAt: null,
            acceptedAt: null,
            failureReason: null,
          }
        return {
          kind: 'material',
          receipt: {
            operationId,
            revision: 1,
            packageFamilyName: 'RSS',
            qualifiedAt: null,
            attemptedAt: null,
            failureReason: null,
            selected: false,
            revoked: false,
          },
        }
      }
      return kind === 'smtp'
        ? { revision: 1, selectedRevision: null, versions: [] }
        : { revision: 1, desiredRevision: null, versions: [] }
    })
    await f.wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(f.calls.filter((o) => o.method === 'POST')).toHaveLength(1)
    for (const input of f.wrapper.findAll('input[type=password]'))
      expect((input.element as HTMLInputElement).value).toBe('')
    expect(JSON.stringify([...f.settings.operations.records.values()])).not.toContain(
      'fixture-secret',
    )
    expect(f.wrapper.text()).toContain('尚未观察')
  },
)
it('clears credentials on tab hiding and prevents changed intent from replaying an unresolved operation', async () => {
  const f = await fixture(ProviderPanel, { kind: 'smtp' })
  const inputs = f.wrapper.findAll('input')
  for (const input of inputs) await input.setValue('a@example.test')
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  document.dispatchEvent(new Event('visibilitychange'))
  await flushPromises()
  expect((f.wrapper.get('input[type=password]').element as HTMLInputElement).value).toBe('')
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  await expect(
    f.settings.operations.submit(
      'smtp',
      'save',
      0,
      '{"profile":"original","sender":"a","recipient":"b"}',
      async () => {
        throw new Error('lost')
      },
    ),
  ).rejects.toThrow()
  const operation = f.settings.operations.records.get('smtp')!
  f.settings.operations.queried('smtp', operation.id)
  await button(f.wrapper, '按原输入显式重试').trigger('click')
  await flushPromises()
  expect(f.calls.filter((o) => o.method === 'POST')).toHaveLength(0)
  expect(f.settings.operations.records.get('smtp')?.state).toBe('unknown')
})
it('provisions with an immediately cleared password and displays capacity without creating a target session', async () => {
  const f = await fixture(TenantsView, {}, 'platform')
  const inputs = f.wrapper.findAll('input')
  for (const input of inputs.slice(0, 3)) await input.setValue('secure-fixture-value')
  f.setHandler((o) => {
    if (o.method === 'POST') return provision(o.headers!['Idempotency-Key']!)
    if (o.path.endsWith('/tenants')) return { items: [] }
    return { items: [], nextAfter: null }
  })
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(
    (f.wrapper.get('input[autocomplete=new-password]').element as HTMLInputElement).value,
  ).toBe('')
  expect(f.calls.filter((o) => o.method === 'POST')).toHaveLength(1)
  expect(JSON.stringify([...f.settings.operations.records.values()])).not.toContain(
    'administratorPassword',
  )
  expect(f.wrapper.find('a[href^="https"]').exists()).toBe(false)
})
it('keeps business sessions out of tenant administration', async () => {
  const f = await fixture(TenantsView)
  expect(f.wrapper.find('form').exists()).toBe(false)
  expect(f.calls.filter((o) => o.path.includes('/tenant-administration/'))).toHaveLength(0)
})
it('keeps PKI current trust reads from unlocking an unknown original operation', async () => {
  const f = await fixture(PkiPanel)
  await expect(
    f.settings.operations.submit('pki', 'activate', 2, '{}', async () => {
      throw new Error('lost')
    }),
  ).rejects.toThrow()
  await flushPromises()
  expect(f.wrapper.text()).toContain('未提供独立操作查询')
  expect(f.wrapper.findAll('button').some((b) => b.text() === '查询原操作')).toBe(false)
  await button(f.wrapper, '重新读取').trigger('click')
  await flushPromises()
  expect(f.settings.operations.records.get('pki')?.state).toBe('unknown')
})
it('prepares task trust with an explicit version and reads a null device observation honestly', async () => {
  const f = await fixture(TaskTrustPanel)
  f.setHandler((o) =>
    o.path.includes('/observation')
      ? null
      : {
          version: 1,
          origin: 'https://mdm.test',
          tenant,
          revision: 1,
          keys: [{ id: 'key', public_key: 'A'.repeat(43), state: 'active' }],
        },
  )
  await f.wrapper.get('input[type=url]').setValue('https://mdm.test')
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(f.settings.operations.records.get('task')?.state).toBe('received')
  const forms = f.wrapper.findAll('form')
  await forms.at(-1)!.get('input').setValue('device-a')
  await forms.at(-1)!.trigger('submit')
  await flushPromises()
  expect(f.wrapper.text()).toContain('尚未观察')
})
it('submits Webhook preparation against the read configuration identity and never displays its imported secret', async () => {
  const f = await fixture(WebhookPanel)
  await f.wrapper.get('input[maxlength="128"]').setValue('events')
  await f.wrapper.get('input[type=url]').setValue('https://receiver.test/hook')
  await f.wrapper.findAll('input[maxlength="128"]')[1]!.setValue('approved')
  await f.wrapper.get('select').setValue('import')
  await f.wrapper.get('input[type=password]').setValue('whsec_secret')
  f.setHandler((o) =>
    o.method === 'POST'
      ? {
          operationId: o.headers!['Idempotency-Key'],
          reference: 'events',
          revision: 1,
          configurationSha256: digest,
          keyDigest: digest,
          challenge: 'YWJj',
          confirmed: false,
          revoked: false,
          endpoint: 'https://receiver.test/hook',
          networkReference: 'approved',
          attemptedAt: null,
          confirmedAt: null,
          failureReason: null,
        }
      : { configurationSha256: digest, keys: { heads: [], materials: [] } },
  )
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(
    (f.calls.find((o) => o.method === 'POST')?.body as { configurationSha256: string })
      .configurationSha256,
  ).toBe(digest)
  expect((f.wrapper.get('input[type=password]').element as HTMLInputElement).value).toBe('')
  expect(JSON.stringify([...f.settings.operations.records.values()])).not.toContain('whsec_secret')
})
it('queries original operations through explicit domain clients and keeps PKI out of fake query choices', async () => {
  const f = await fixture(OperationsPanel)
  await f.wrapper.get('select').setValue('smtp')
  await f.wrapper.get('input').setValue(id)
  f.setHandler(() => ({
    operationId: id,
    revision: 1,
    profile: 'mail',
    state: 'accepted',
    attemptedAt: 1,
    acceptedAt: 2,
    failureReason: null,
  }))
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(f.calls.at(-1)?.path).toBe('/api/v1/smtp/operations/{id}')
  expect(f.wrapper.find('option[value=pki]').exists()).toBe(false)
})
it('offers platform package tasks without technical publication forms', async () => {
  const f = await fixture(PackagesPanel)
  expect(f.wrapper.text()).toContain('添加安装包')
  expect(f.wrapper.find('form').exists()).toBe(false)
  for (const name of ['Windows x64', 'Windows ARM64', 'macOS Intel', 'macOS Apple Silicon'])
    expect(f.wrapper.text()).toContain(name)
  expect(f.wrapper.find('textarea').exists()).toBe(false)
})
it('edits tenant metadata with explicit CAS and clears an added administrator password', async () => {
  const f = await fixture(TenantEditor, { tenant: row }, 'platform')
  f.setHandler((o) => ({
    operationId: o.headers!['Idempotency-Key'],
    action: o.path.endsWith('/administrators') ? 'administrator_create' : 'update',
    result: o.path.endsWith('/administrators')
      ? {
          tenantId: tenant,
          principalId: principal,
          login: 'new-admin',
          ruleId: id,
          ruleRevision: 1,
        }
      : row,
  }))
  await f.wrapper.findAll('form')[0]!.get('input').setValue('Updated')
  await f.wrapper.findAll('form')[0]!.trigger('submit')
  await flushPromises()
  expect(f.calls.find((o) => o.method === 'PUT')?.body).toMatchObject({
    expectedRevision: 1,
    name: 'Updated',
  })
  const admin = f.wrapper.findAll('form')[1]!
  await admin.findAll('input')[0]!.setValue('new-admin')
  await admin.get('input[type=password]').setValue('private-password')
  await admin.trigger('submit')
  await flushPromises()
  expect((admin.get('input[type=password]').element as HTMLInputElement).value).toBe('')
  expect(JSON.stringify([...f.settings.operations.records.values()])).not.toContain(
    'private-password',
  )
})

it('requires reading the conflicting version and a separate explicit edit decision', async () => {
  const f = await fixture(ProviderPanel, { kind: 'storage' })
  f.setHandler((o) => {
    if (o.method === 'POST') throw decodeMdmError(409, { code: 'operation_conflict' })
    return { revision: 2, desiredRevision: null, versions: [] }
  })
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(f.settings.operations.records.get('storage')?.state).toBe('conflict')
  expect(button(f.wrapper, '已比较，重新编辑')).toBeUndefined()
  await button(f.wrapper, '读取最新状态以比较').trigger('click')
  await flushPromises()
  expect(f.settings.operations.records.get('storage')?.state).toBe('conflict')
  await button(f.wrapper, '已比较，重新编辑').trigger('click')
  await flushPromises()
  expect(f.settings.operations.records.has('storage')).toBe(false)
})

it('retains one PKI rotation identity and advances the revision through every phase', async () => {
  const f = await fixture(PkiPanel)
  let trust = {
    version: 1,
    origin: 'https://mdm.test',
    tenant,
    purpose: 'agent',
    revision: 1,
    issuers: [
      {
        digest,
        mode: 'active',
        certificate: 'YQ==',
        root: 'YQ==',
        crl: 'YQ==',
        root_crl: 'YQ==',
        provisioner: 'agent',
        kid: 'kid-a',
      },
    ],
  }
  const candidate = {
    ...trust,
    revision: 2,
    issuers: [...trust.issuers, { ...trust.issuers[0]!, digest: 'b'.repeat(64), mode: 'prepared' }],
  }
  let rotation = ''
  f.setHandler((o) => {
    if (o.method === 'GET') return trust
    const input = o.body as {
      id: string
      expected_revision: number
      candidate?: typeof trust
      action?: string
    }
    if (!rotation) rotation = input.id
    expect(input.id).toBe(rotation)
    expect(input.expected_revision).toBe(trust.revision)
    trust = input.candidate ?? { ...trust, revision: trust.revision + 1 }
    return { operation: rotation, revision: trust.revision, state: input.action ?? 'distributing' }
  })
  await button(f.wrapper, '重新读取').trigger('click')
  await flushPromises()
  const file = f.wrapper.get('input[type=file]')
  Object.defineProperty(file.element, 'files', {
    configurable: true,
    value: [{ size: 1024, text: async () => JSON.stringify(candidate) }],
  })
  await file.trigger('change')
  await flushPromises()
  await button(f.wrapper, '导入材料').trigger('click')
  await flushPromises()
  for (const label of ['批准信任', '启用新版本', '退出旧版本']) {
    await button(f.wrapper, label).trigger('click')
    await flushPromises()
  }
  const writes = f.calls.filter((o) => o.method === 'POST')
  expect(writes).toHaveLength(4)
  expect(writes.map((o) => (o.body as { id: string }).id)).toEqual([
    rotation,
    rotation,
    rotation,
    rotation,
  ])
  expect(f.settings.operations.records.get('pki')?.id).toBe(rotation)
})
it('fences delayed public file reads before they can repopulate a new session', async () => {
  const f = await fixture(PkiPanel)
  let resolve!: (value: string) => void
  const file = f.wrapper.get('input[type=file]')
  Object.defineProperty(file.element, 'files', {
    configurable: true,
    value: [{ size: 10, text: () => new Promise<string>((r) => (resolve = r)) }],
  })
  await file.trigger('change')
  f.state.value = { ...f.state.value, session: { id: principal } }
  resolve('{}')
  await flushPromises()
  expect(f.calls.filter((o) => o.method === 'POST')).toHaveLength(0)
  expect(button(f.wrapper, '导入材料').attributes('disabled')).toBeDefined()
})
it('clears an unused imported Apple key when submitting a different material action', async () => {
  const f = await fixture(ApplePanel, { purpose: 'apns' })
  await f.wrapper.get('select').setValue('import')
  await f.wrapper.get('textarea').setValue('UNUSED PRIVATE KEY')
  f.setHandler((o) =>
    o.method === 'POST'
      ? {
          operationId: o.headers!['Idempotency-Key'],
          revision: 1,
          state: 'pending_application',
          desiredRevision: 1,
        }
      : {
          revision: 1,
          desiredRevision: 1,
          versions: [],
          runtimeObservation: 'separate',
          accountBindings: {},
        },
  )
  await f.wrapper.findAll('form')[2]!.trigger('submit')
  await flushPromises()
  expect((f.wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('')
})
it('clears an unused administrator password when saving metadata', async () => {
  const f = await fixture(TenantEditor, { tenant: row }, 'platform')
  await f.wrapper.get('input[type=password]').setValue('UNUSED PASSWORD')
  f.setHandler((o) => ({
    operationId: o.headers!['Idempotency-Key'],
    action: 'update',
    result: row,
  }))
  await f.wrapper.findAll('form')[0]!.trigger('submit')
  await flushPromises()
  expect((f.wrapper.get('input[type=password]').element as HTMLInputElement).value).toBe('')
})
it('shows the current host identity when the readiness contract reports unavailable', async () => {
  const f = await fixture(DeploymentPanel)
  f.setHandler(() => ({
    ready: false,
    observation: {
      hostId: id,
      operationId: principal,
      revision: 9,
      materialDigest: digest,
      processGeneration: id,
      tenantId: tenant,
      instanceId: id,
    },
  }))
  await button(f.wrapper, '重新读取').trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain('暂不可用')
  expect(f.wrapper.text()).toContain('9')
  expect(f.wrapper.text()).toContain(id)
})

it('revokes a WNS version while clearing unrelated credentials in the same form', async () => {
  const f = await fixture(ProviderPanel, { kind: 'wns' }),
    version = {
      operationId: id,
      revision: 1,
      packageFamilyName: 'RSS',
      qualifiedAt: 1,
      attemptedAt: 1,
      failureReason: null,
      selected: true,
      revoked: false,
    }
  f.setHandler((o) =>
    o.method === 'GET'
      ? { revision: 1, desiredRevision: 1, versions: [version] }
      : {
          kind: 'revocation',
          receipt: { operationId: o.headers!['Idempotency-Key'], revision: 2, materialRevision: 1 },
        },
  )
  await button(f.wrapper, '重新读取').trigger('click')
  await flushPromises()
  await f.wrapper.get('input[type=password]').setValue('UNUSED WNS SECRET')
  await f.wrapper.get('select').setValue('1')
  await f.wrapper.findAll('form')[1]!.trigger('submit')
  await flushPromises()
  expect(f.calls.find((o) => o.method === 'POST')?.body).toEqual({
    expectedRevision: 1,
    materialRevision: 1,
  })
  expect((f.wrapper.get('input[type=password]').element as HTMLInputElement).value).toBe('')
})
it('activates an existing Webhook revision without retaining an unrelated imported secret', async () => {
  const f = await fixture(WebhookPanel)
  const material = {
      operationId: id,
      reference: 'events',
      revision: 1,
      configurationSha256: digest,
      keyDigest: digest,
      challenge: 'YWJj',
      confirmed: true,
      revoked: false,
      endpoint: 'https://receiver.test/hook',
      networkReference: 'approved',
      attemptedAt: 1,
      confirmedAt: 1,
      failureReason: null,
    },
    head = { reference: 'events', revision: 1, activeRevision: null, retiringRevision: null }
  f.setHandler((o) =>
    o.method === 'GET'
      ? { configurationSha256: digest, keys: { heads: [head], materials: [material] } }
      : { operationId: o.headers!['Idempotency-Key'], ...head, revision: 2, activeRevision: 1 },
  )
  await button(f.wrapper, '重新读取').trigger('click')
  await flushPromises()
  await f.wrapper.get('input[maxlength="128"]').setValue('events')
  await f.wrapper.findAll('select')[0]!.setValue('import')
  await f.wrapper.get('input[type=password]').setValue('UNUSED WEBHOOK SECRET')
  await f.wrapper.findAll('select')[1]!.setValue('1')
  await f.wrapper.findAll('form')[1]!.trigger('submit')
  await flushPromises()
  expect((f.wrapper.get('input[type=password]').element as HTMLInputElement).value).toBe('')
  expect(f.calls.find((o) => o.method === 'POST')?.path).toBe(
    '/api/v1/webhooks/materials/transitions',
  )
})

it('restores an unknown Webhook reference after remount and retries only exact public input', async () => {
  const f = await fixture(WebhookPanel),
    directory = { configurationSha256: digest, keys: { heads: [], materials: [] } }
  f.setHandler((o) => {
    if (o.method === 'POST') throw new Error('response lost')
    if (o.path.includes('/operations/')) throw decodeMdmError(404, { code: 'operation_not_found' })
    return directory
  })
  await f.wrapper.get('input[maxlength="128"]').setValue('events')
  await f.wrapper.get('input[type=url]').setValue('https://receiver.test/hook')
  await f.wrapper.findAll('input[maxlength="128"]')[1]!.setValue('approved')
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  const original = f.settings.operations.records.get('webhook')!.id
  await f.remount()
  const reference = f.wrapper.get('input[maxlength="128"]')
  expect(reference.attributes('disabled')).toBeUndefined()
  await button(f.wrapper, '查询原操作').trigger('click')
  await flushPromises()
  await reference.setValue('wrong')
  await f.wrapper.get('input[type=url]').setValue('https://receiver.test/hook')
  await f.wrapper.findAll('input[maxlength="128"]')[1]!.setValue('approved')
  await button(f.wrapper, '按原输入显式重试').trigger('click')
  await flushPromises()
  expect(f.calls.filter((o) => o.method === 'POST')).toHaveLength(1)
  await reference.setValue('events')
  f.setHandler((o) =>
    o.method === 'POST'
      ? {
          operationId: original,
          reference: 'events',
          revision: 1,
          configurationSha256: digest,
          keyDigest: digest,
          challenge: 'YWJj',
          confirmed: false,
          revoked: false,
          endpoint: 'https://receiver.test/hook',
          networkReference: 'approved',
          attemptedAt: null,
          confirmedAt: null,
          failureReason: null,
        }
      : directory,
  )
  await button(f.wrapper, '按原输入显式重试').trigger('click')
  await flushPromises()
  const writes = f.calls.filter((o) => o.method === 'POST')
  expect(writes).toHaveLength(2)
  expect(writes[1]?.headers?.['Idempotency-Key']).toBe(original)
  expect(f.settings.operations.records.get('webhook')?.state).toBe('received')
})
it('refreshes current task trust after confirming a historical receipt before allowing another write', async () => {
  const f = await fixture(TaskTrustPanel)
  const trust = (revision: number) => ({
    version: 1,
    origin: 'https://mdm.test',
    tenant,
    revision,
    keys: [{ id: 'key-a', public_key: 'A'.repeat(43), state: 'active' }],
  })
  let current = 1,
    lose = true
  f.setHandler((o) => {
    if (o.method === 'POST') {
      if (lose) {
        current = 2
        throw new Error('lost committed response')
      }
      expect((o.body as { expectedRevision: number }).expectedRevision).toBe(3)
      current = 4
      return trust(current)
    }
    return o.path.includes('/operations/') ? trust(2) : trust(current)
  })
  await button(f.wrapper, '重新读取').trigger('click')
  await flushPromises()
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(f.settings.operations.records.get('task')?.state).toBe('unknown')
  current = 3
  await button(f.wrapper, '查询原操作').trigger('click')
  await flushPromises()
  expect(f.settings.operations.records.get('task')?.state).toBe('received')
  expect(f.wrapper.text()).toContain('保存版本 3')
  lose = false
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(f.calls.filter((o) => o.method === 'POST')).toHaveLength(2)
  expect(f.settings.operations.records.get('task')?.state).toBe('received')
})

it('saves first-use choices, restores backend facts, and finishes only through a confirmed completion receipt', async () => {
  const f = await fixture(FirstUseView, {}, 'tenant', 'settings-guide')
  let intent: FirstUseIntent = { channels: [], capabilities: {}, completionRequested: false },
    revision = 0,
    ready = false
  f.setHandler((o) => {
    if (o.path === '/api/v1/agent-packages') return []
    if (o.method === 'PUT') {
      const body = o.body as { expectedRevision: number; intent: FirstUseIntent }
      expect(body.expectedRevision).toBe(revision)
      intent = body.intent
      if (intent.completionRequested && !ready)
        throw decodeMdmError(409, { code: 'first_use_not_ready' })
      revision++
      return { operationId: o.headers!['Idempotency-Key'], saved: { revision, intent } }
    }
    return {
      tenantId: tenant,
      saved: { revision, intent },
      steps: [
        { id: 's3', status: ready ? 'ready' : 'pending', reason: null, evidence: [] },
        ...intent.channels.map((channel) => ({
          id: channel,
          status: ready ? 'ready' : 'pending',
          reason: ready ? null : 'registration_not_allowed',
          evidence: [],
        })),
      ],
      canComplete: ready,
      complete: ready && intent.completionRequested,
    }
  })
  await button(f.wrapper, '重新读取').trigger('click')
  await flushPromises()
  expect((f.wrapper.get('input[value=agent]').element as HTMLInputElement).checked).toBe(true)
  await f.wrapper.get('input[value=agent]').setValue(false)
  await f.wrapper.get('input[value=windows_mdm]').setValue(true)
  await guideStep(f.wrapper, '通知与其他集成')
  await f.wrapper.get('[data-capability=smtp]').setValue('skip')
  await f.wrapper.get('input[placeholder="跳过理由"]').setValue('Not needed')
  await button(f.wrapper, '保存本次选择').trigger('click')
  await flushPromises()
  expect(intent.capabilities.smtp).toEqual({ kind: 'skip', reason: 'Not needed' })
  await guideStep(f.wrapper, '注册就绪检查')
  expect(button(f.wrapper, '完成').attributes('disabled')).toBeDefined()
  await f.remount()
  await guideStep(f.wrapper, '选择管理通道')
  expect((f.wrapper.get('input[value=windows_mdm]').element as HTMLInputElement).checked).toBe(true)
  ready = true
  await button(f.wrapper, '重新读取').trigger('click')
  await flushPromises()
  await guideStep(f.wrapper, '注册就绪检查')
  await button(f.wrapper, '完成').trigger('click')
  await flushPromises()
  expect(intent.completionRequested).toBe(true)
  expect(f.router.currentRoute.value.name).toBe('workspace')
})
it('queries the original first-use operation after a lost response and never replaces it after reload without its input', async () => {
  const f = await fixture(FirstUseView, {}, 'tenant', 'settings-guide')
  const intent: FirstUseIntent = {
    channels: ['windows_mdm'],
    capabilities: {},
    completionRequested: false,
  }
  let committed = false,
    operation = ''
  f.setHandler((o) => {
    if (o.path === '/api/v1/agent-packages') return []
    if (o.method === 'PUT') {
      operation = o.headers!['Idempotency-Key']!
      throw decodeMdmError(503, { code: 'operation_unknown' })
    }
    if (o.path.endsWith('/operations/{id}')) {
      if (!committed) throw decodeMdmError(404, { code: 'first_use_operation_not_found' })
      return { operationId: operation, saved: { revision: 2, intent } }
    }
    return {
      tenantId: tenant,
      saved: { revision: 1, intent },
      steps: [{ id: 'windows_mdm', status: 'pending', reason: null, evidence: [] }],
      canComplete: false,
      complete: false,
    }
  })
  await button(f.wrapper, '重新读取').trigger('click')
  await flushPromises()
  await button(f.wrapper, '保存本次选择').trigger('click')
  await flushPromises()
  expect(f.router.currentRoute.value.query['operation']).toBe(operation)
  f.settings.operations.records.clear()
  await f.remount()
  expect(f.wrapper.text()).toContain('完整原请求未保留')
  expect(button(f.wrapper, '保存本次选择').attributes('disabled')).toBeDefined()
  expect(f.calls.filter((o) => o.method === 'PUT')).toHaveLength(1)
  committed = true
  await button(f.wrapper, '查询原操作').trigger('click')
  await flushPromises()
  expect(f.router.currentRoute.value.query['operation']).toBeUndefined()
  expect(f.wrapper.text()).not.toContain('完整原请求未保留')
  expect(f.calls.filter((o) => o.method === 'PUT')).toHaveLength(1)
})

it('restores the exact in-memory first-use request across navigation before explicit original replay', async () => {
  const f = await fixture(FirstUseView, {}, 'tenant', 'settings-guide')
  const intent: FirstUseIntent = {
    channels: ['windows_mdm'],
    capabilities: { smtp: { kind: 'skip', reason: 'Original reason' } },
    completionRequested: false,
  }
  let attempts = 0
  const ids: string[] = [],
    bodies: unknown[] = []
  f.setHandler((o) => {
    if (o.path === '/api/v1/agent-packages') return []
    if (o.method === 'PUT') {
      ids.push(o.headers!['Idempotency-Key']!)
      bodies.push(o.body)
      if (++attempts === 1) throw decodeMdmError(503, { code: 'operation_unknown' })
      return { operationId: ids[0], saved: { revision: 2, intent } }
    }
    if (o.path.endsWith('/operations/{id}'))
      throw decodeMdmError(404, { code: 'first_use_operation_not_found' })
    return {
      tenantId: tenant,
      saved: { revision: 1, intent },
      steps: [{ id: 'windows_mdm', status: 'pending', reason: null, evidence: [] }],
      canComplete: false,
      complete: false,
    }
  })
  await button(f.wrapper, '重新读取').trigger('click')
  await flushPromises()
  await button(f.wrapper, '保存本次选择').trigger('click')
  await flushPromises()
  await f.remount()
  await guideStep(f.wrapper, '选择管理通道')
  expect((f.wrapper.get('input[value=windows_mdm]').element as HTMLInputElement).checked).toBe(true)
  await guideStep(f.wrapper, '通知与其他集成')
  expect((f.wrapper.get('input[placeholder="跳过理由"]').element as HTMLInputElement).value).toBe(
    'Original reason',
  )
  await button(f.wrapper, '按原输入显式重试').trigger('click')
  await flushPromises()
  expect(ids).toHaveLength(2)
  expect(ids[1]).toBe(ids[0])
  expect(bodies[1]).toEqual(bodies[0])
  expect(f.settings.operations.records.get('first-use')?.state).toBe('received')
})
it('keeps an unknown operation locked when a successful query returns no receipt', async () => {
  let action!: ReturnType<(typeof import('../useSettingsAction'))['useSettingsAction']>
  const Harness = defineComponent({
    setup() {
      action = useSettingsAction(() => 'package-upload')
      return () => null
    },
  })
  const f = await fixture(Harness)
  await action.submit(
    'publish',
    0,
    { packageId: id },
    async () => {
      throw new Error('lost response')
    },
    () => {},
  )
  const original = f.settings.operations.records.get('package-upload')!
  await action.query(
    original.id,
    async () => null,
    () => {},
    (value) => value !== null,
  )
  expect(f.settings.operations.records.get('package-upload')).toMatchObject({
    id: original.id,
    state: 'unknown',
    queried: true,
  })
})
it.each(['save', 'publish'] as const)(
  'restores an unknown %s task after remount and retains its original operation',
  async (action) => {
    const f = await fixture(PackageUpload, {
      target: { platform: 'windows', architecture: 'x86_64' },
      canUpload: true,
      canPublish: true,
      canQuery: true,
    })
    const input = { packageId: id, version: '1.0', platform: 'windows', architecture: 'x86_64' }
    await expect(
      f.settings.operations.submit('package-upload', action, 0, JSON.stringify(input), async () => {
        throw new Error('response lost')
      }),
    ).rejects.toThrow()
    const original = f.settings.operations.records.get('package-upload')!.id
    await f.remount()
    const receipt = {
      packageId: id,
      resource: id,
      version: 'v1',
      variant: 'default',
      productVersion: '1.0',
      material: { format: 'exe', version: null, architectures: ['x86_64'], bundleId: null },
      sha256: Array(32).fill(1),
      length: 10,
      filename: 'agent.exe',
      href: `/api/v1/software/resources/${id}/versions/v1`,
      storageRevision: 4,
    }
    const published = {
      releaseId: principal,
      tenantId: tenant,
      target: { platform: 'windows', architecture: 'x86_64' },
      version: '1.0',
      format: 'windows_exe',
      filename: 'agent.exe',
      length: 10,
      installerSha256: Array(32).fill(1),
    }
    f.setHandler((o) => (o.method === 'GET' ? (action === 'save' ? receipt : null) : published))
    await f.wrapper
      .findAll('button')
      .find((b) => b.text() === '查询原操作')!
      .trigger('click')
    await flushPromises()
    if (action === 'save') {
      const button = f.wrapper.findAll('button').find((b) => b.text() === '发布已保存安装包')!
      expect(button.attributes('disabled')).toBeUndefined()
      await button.trigger('click')
      await flushPromises()
      expect(f.calls.filter((o) => o.method === 'POST').at(-1)?.path).toBe('/api/v1/agent-packages')
    } else {
      const replay = f.wrapper.findAll('button').find((b) => b.text() === '明确重放原操作')!
      expect(replay.attributes('disabled')).toBeUndefined()
      await replay.trigger('click')
      await flushPromises()
      expect(f.calls.filter((o) => o.method === 'POST').at(-1)?.body).toMatchObject({
        operationId: original,
        packageId: id,
      })
    }
  },
)
it('resumes the durable upload frontier and retries publication without saving a second software version', async () => {
  const f = await fixture(PackageUpload, {
    target: { platform: 'windows', architecture: 'x86_64' },
    canUpload: true,
    canPublish: true,
    canQuery: true,
  })
  let uploadId = '',
    offset = 0,
    failAppend = true,
    failPublish = true
  const bytes = new Uint8Array(8).fill(7),
    checksum = Array(32).fill(1)
  vi.stubGlobal('crypto', {
    randomUUID: () => id,
    subtle: { digest: async () => new Uint8Array(checksum).buffer },
  })
  const status = () => ({
    id: uploadId,
    binding: {
      purpose: { kind: 'software', binding: { resource: uploadId, filename: 'agent.exe' } },
      reference: 'installer',
      length: bytes.length,
      sha256: checksum,
      actor: 'fixture',
    },
    offset,
    expires: 4102444800,
    complete: false,
  })
  f.setHandler((o) => {
    if (o.path === '/api/v1/agent-packages/uploads') {
      uploadId = (o.body as { operationId: string }).operationId
      return {
        packageId: uploadId,
        resource: uploadId,
        upload: uploadId,
        offset,
        length: bytes.length,
        complete: false,
        href: `/api/v1/resources/${uploadId}/uploads/${uploadId}`,
      }
    }
    if (o.path.endsWith('/complete')) return undefined
    if (o.path.includes('/resources/') && o.method === 'GET') return status()
    if (o.method === 'PATCH') {
      if (failAppend) {
        failAppend = false
        offset = 4
        throw new Error('lost upload response')
      }
      expect(o.query?.['offset']).toBe(4)
      offset = bytes.length
      return status()
    }
    if (o.path === '/api/v1/agent-packages/uploads/{id}')
      return {
        packageId: uploadId,
        filename: 'agent.exe',
        length: bytes.length,
        sha256: checksum,
        facts: { format: 'exe', version: null, architectures: ['x86_64'], bundleId: null },
      }
    if (o.path.endsWith('/save'))
      return {
        packageId: uploadId,
        resource: uploadId,
        version: 'v1',
        variant: 'default',
        productVersion: '1.2',
        material: { format: 'exe', version: null, architectures: ['x86_64'], bundleId: null },
        sha256: checksum,
        length: bytes.length,
        filename: 'agent.exe',
        href: `/api/v1/software/resources/${uploadId}/versions/v1`,
        storageRevision: 4,
      }
    if (failPublish) {
      failPublish = false
      throw decodeMdmError(403, { code: 'permission_denied' })
    }
    return {
      releaseId: principal,
      tenantId: tenant,
      target: { platform: 'windows', architecture: 'x86_64' },
      version: '1.2',
      format: 'windows_exe',
      filename: 'agent.exe',
      length: bytes.length,
      installerSha256: checksum,
    }
  })
  const file = new File([bytes], 'agent.exe')
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer })
  Object.defineProperty(file, 'slice', {
    value: (start: number, end: number) => ({
      arrayBuffer: async () => bytes.slice(start, end).buffer,
    }),
  })
  Object.defineProperty(f.wrapper.get('input[type=file]').element, 'files', { value: [file] })
  await f.wrapper.get('input[type=file]').trigger('change')
  await flushPromises()
  await f.wrapper
    .findAll('button')
    .find((b) => b.text() === '核对并继续上传')!
    .trigger('click')
  await flushPromises()
  await f.wrapper.get('input.ui-input').setValue('1.2')
  await f.wrapper
    .findAll('button')
    .find((b) => b.text() === '发布安装包')!
    .trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain('已保存待发布')
  await f.wrapper
    .findAll('button')
    .find((b) => b.text() === '发布已保存安装包')!
    .trigger('click')
  await flushPromises()
  expect(f.wrapper.emitted('published')).toHaveLength(1)
  expect(f.calls.filter((o) => o.path.endsWith('/save'))).toHaveLength(1)
  expect(f.calls.filter((o) => o.path === '/api/v1/agent-packages')).toHaveLength(2)
  expect(JSON.stringify([...f.settings.operations.records.values()])).not.toContain('agent.exe')
  vi.unstubAllGlobals()
})

const releaseForRecovery = {
  releaseId: principal,
  tenantId: tenant,
  target: { platform: 'windows', architecture: 'x86_64' },
  version: '1.0',
  format: 'windows_exe',
  filename: 'agent.exe',
  length: 10,
  installerSha256: Array(32).fill(1),
}
const savedForRecovery = {
  packageId: id,
  resource: id,
  version: 'v1',
  variant: 'default',
  productVersion: '1.0',
  material: { format: 'exe', version: null, architectures: ['x86_64'], bundleId: null },
  sha256: Array(32).fill(1),
  length: 10,
  filename: 'agent.exe',
  href: `/api/v1/software/resources/${id}/versions/v1`,
  storageRevision: 4,
}
function dialogButton(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('[role=alertdialog] button')].find(
    (b) => b.textContent?.trim() === label,
  )
  expect(found).toBeDefined()
  return found!
}
it('confirms an ordinary withdrawal without treating its click event as a replay', async () => {
  const f = await fixture(PackagesPanel)
  let withdrawn = false
  f.setHandler((o) => {
    if (o.method === 'POST') {
      withdrawn = true
      return undefined
    }
    return withdrawn ? [] : [releaseForRecovery]
  })
  await button(f.wrapper, '重新读取').trigger('click')
  await flushPromises()
  await button(f.wrapper, '撤回发布包').trigger('click')
  await flushPromises()
  dialogButton('确认撤回').click()
  await flushPromises()
  expect(f.calls.filter((o) => o.method === 'POST')).toMatchObject([
    { path: '/api/v1/agent-packages/{id}/withdraw', pathParams: { id: principal } },
  ])
  expect(f.wrapper.text()).not.toContain('agent.exe')
})
it.each([false, true])(
  'retains an unknown withdrawal after closing and remount=%s, then explicitly replays the original',
  async (remount) => {
    const f = await fixture(PackagesPanel)
    let attempts = 0
    f.setHandler((o) => {
      if (o.method === 'POST') {
        if (++attempts === 1) throw new Error('lost receipt')
        return undefined
      }
      return o.path.includes('/operations/') ? null : attempts > 1 ? [] : [releaseForRecovery]
    })
    await button(f.wrapper, '重新读取').trigger('click')
    await flushPromises()
    await button(f.wrapper, '撤回发布包').trigger('click')
    await flushPromises()
    dialogButton('确认撤回').click()
    await flushPromises()
    const original = f.settings.operations.records.get('packages')!.id
    dialogButton('查询原操作').click()
    await flushPromises()
    expect(f.settings.operations.records.get('packages')?.state).toBe('unknown')
    document
      .querySelector<HTMLButtonElement>('[role=alertdialog] button[aria-label="取消"]')!
      .click()
    await flushPromises()
    if (remount) await f.remount()
    await button(f.wrapper, '查询原操作').trigger('click')
    await flushPromises()
    expect(attempts).toBe(1)
    expect(f.settings.operations.records.get('packages')).toMatchObject({
      id: original,
      state: 'unknown',
      queried: true,
    })
    await button(f.wrapper, '按原输入显式重试').trigger('click')
    await flushPromises()
    expect(attempts).toBe(2)
    expect(f.calls.filter((o) => o.method === 'POST').map((o) => o.body)).toEqual([
      { operationId: original },
      { operationId: original },
    ])
  },
)
it.each(['received-before-return', 'received-after-return', 'unknown-after-return'] as const)(
  'recovers a navigating save task that becomes %s without uploading or saving a new version',
  async (outcome) => {
    const f = await fixture(PackagesPanel)
    let settle!: () => void
    const input = { packageId: id, version: '1.0', platform: 'windows', architecture: 'x86_64' }
    const saving = f.settings.operations
      .submit(
        'package-upload',
        'save',
        0,
        JSON.stringify(input),
        () =>
          new Promise((resolve, reject) => {
            settle = () =>
              outcome === 'unknown-after-return'
                ? reject(new Error('lost receipt'))
                : resolve(savedForRecovery)
          }),
      )
      .catch(() => undefined)
    const original = f.settings.operations.records.get('package-upload')!.id
    if (outcome === 'received-before-return') {
      settle()
      await saving
    }
    await f.remount()
    if (outcome !== 'received-before-return') {
      expect(f.wrapper.text()).toContain('正在保存安装包')
      settle()
      await saving
      await flushPromises()
    }
    f.setHandler((o) => {
      if (o.method === 'GET') return o.path.includes('/operations/') ? null : []
      return o.path.endsWith('/save') ? savedForRecovery : releaseForRecovery
    })
    expect(f.wrapper.find('input[type=file]').exists()).toBe(false)
    if (outcome === 'unknown-after-return') {
      await button(f.wrapper, '查询原操作').trigger('click')
      await flushPromises()
      expect(f.settings.operations.records.get('package-upload')?.state).toBe('unknown')
      await button(f.wrapper, '明确重放原操作').trigger('click')
    } else {
      expect(f.wrapper.text()).toContain('已保存待发布')
      await button(f.wrapper, '发布已保存安装包').trigger('click')
    }
    await flushPromises()
    const writes = f.calls.filter((o) => o.method === 'POST')
    expect(writes.map((o) => o.path)).toEqual(
      outcome === 'unknown-after-return'
        ? ['/api/v1/agent-packages/save', '/api/v1/agent-packages']
        : ['/api/v1/agent-packages'],
    )
    if (outcome === 'unknown-after-return')
      expect(writes[0]!.body).toMatchObject({ operationId: original, packageId: id })
    expect(f.settings.operations.records.has('package-upload')).toBe(false)
  },
)

it('recovers field writes across remount without replay and compares conflicts before editing', async () => {
  const value = {
    key: 'employee',
    displayName: 'Employee',
    source: { kind: 'identity_local' },
    pointer: '/extensions/employee',
    valueType: 'string',
    maxLength: null,
    maxItems: null,
    minimum: null,
    maximum: null,
    enabled: true,
    sensitive: false,
    visibility: 'both',
    displayUse: 'profile',
    required: true,
    useExistingObservation: false,
  }
  const field = { fieldId: id, revision: 1, collectedAfterMicros: 1, value }
  const f = await fixture(UserAttributeEditor, {
    field,
    sources: [
      {
        source: { kind: 'identity_local' },
        providerConfigVersion: null,
        extensionsRoot: 'extensions',
        maxAgeSeconds: 14400,
      },
    ],
  })
  let operation = ''
  f.setHandler((o) => {
    if (o.method === 'PUT') {
      operation = (o.body as { operationId: string }).operationId
      throw new Error('lost')
    }
    return { operationId: operation, definition: { ...field, revision: 2 } }
  })
  await f.wrapper.get('#attribute-name').setValue('Updated')
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(f.settings.operations.records.get('user-attribute:' + id)?.state).toBe('unknown')
  await f.remount()
  expect(f.wrapper.get('fieldset').attributes('disabled')).toBeDefined()
  await button(f.wrapper, '查询原操作').trigger('click')
  await flushPromises()
  expect(f.calls.filter((o) => o.method === 'PUT')).toHaveLength(1)
  expect(f.settings.operations.records.get('user-attribute:' + id)?.state).toBe('received')
  f.setHandler((o) => {
    if (o.method === 'PUT') throw decodeMdmError(409, { code: 'operation_conflict' })
    return { ...field, revision: 3 }
  })
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(f.settings.operations.records.get('user-attribute:' + id)?.state).toBe('conflict')
  await button(f.wrapper, '读取最新状态以比较').trigger('click')
  await flushPromises()
  expect(f.calls.filter((o) => o.method === 'PUT')).toHaveLength(2)
})
it('profile reads clear stale data on denied responses and authentication changes', async () => {
  const f = await fixture(ProfilePanel)
  const value = {
    principalId: principal,
    view: 'current',
    profiles: [],
    fields: [],
    completeness: { required: 0, complete: 0, missing: 0 },
  }
  f.setHandler(() => value)
  await button(f.wrapper, '重新读取').trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain(principal)
  f.setHandler(() => {
    throw decodeMdmError(403, { code: 'permission_denied' })
  })
  await button(f.wrapper, '重新读取').trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).not.toContain(principal)
  f.state.value = { ...f.state.value, status: 'anonymous' }
  await flushPromises()
  expect(f.wrapper.text()).not.toContain(principal)
})

it('keeps display edits on the existing observation gate and resets it for mapping changes', async () => {
  const value = {
    key: 'employee',
    displayName: 'Employee',
    source: { kind: 'identity_local' },
    pointer: '/extensions/employee',
    valueType: 'string',
    maxLength: 50,
    maxItems: null,
    minimum: null,
    maximum: null,
    enabled: true,
    sensitive: false,
    visibility: 'both',
    displayUse: 'profile',
    required: true,
    useExistingObservation: true,
  }
  const field = { fieldId: id, revision: 1, collectedAfterMicros: 0, value }
  const f = await fixture(UserAttributeEditor, {
    field,
    sources: [
      {
        source: value.source,
        providerConfigVersion: null,
        extensionsRoot: 'extensions',
        maxAgeSeconds: 14400,
      },
    ],
  })
  let written: typeof value
  f.setHandler((o) => {
    written = (o.body as { value: typeof value }).value
    return {
      operationId: (o.body as { operationId: string }).operationId,
      definition: { ...field, revision: 2, value: written },
    }
  })
  await f.wrapper.get('#attribute-name').setValue('Renamed')
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(written!.useExistingObservation).toBe(true)
  await f.wrapper.get('#attribute-type').setValue('integer')
  await f.wrapper.get('#attribute-min').setValue('0')
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(written!).toMatchObject({
    useExistingObservation: false,
    valueType: 'integer',
    minimum: 0,
    maxLength: null,
  })
  const sensitive = f.wrapper
    .findAll('label')
    .find((l) => l.text() === '敏感字段')!
    .get('input')
  await sensitive.setValue(true)
  expect((f.wrapper.get('#attribute-visibility').element as HTMLSelectElement).value).toBe(
    'profiles_read',
  )
  await f.wrapper.get('#attribute-visibility').setValue('both')
  await f.wrapper.get('#attribute-type').setValue('object')
  await f.wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(written!).toMatchObject({
    valueType: 'object',
    maxItems: 256,
    sensitive: true,
    visibility: 'both',
  })
  await f.wrapper
    .findAll('label')
    .find((l) => l.text().includes('确认删除此字段'))!
    .get('input')
    .setValue(true)
  await button(f.wrapper, '删除字段').trigger('click')
  await flushPromises()
  expect(written!).toBe(null)
})

it('expires rendered observations without renewing them and preserves false and zero', async () => {
  const f = await fixture(ProfilePanel)
  const source = { kind: 'identity_local' }
  const expires = Math.floor(Date.now() / 1000) + 2
  f.setHandler(() => ({
    principalId: principal,
    view: 'current',
    profiles: [
      {
        source,
        status: 'available',
        snapshotId: id,
        providerConfigVersion: null,
        sourceRevision: 1,
        observedAt: expires - 100,
        collectedAtMicros: 1,
        expiresAt: expires,
        fixed: {
          displayName: { status: 'available', value: 'Visible person' },
          username: { status: 'missing' },
          email: { status: 'missing' },
          emailVerified: { status: 'available', value: false },
        },
      },
    ],
    fields: [
      {
        fieldId: id,
        revision: 1,
        key: 'zero',
        displayName: 'Zero',
        source,
        valueType: 'integer',
        sensitive: false,
        displayUse: 'profile',
        required: true,
        status: 'available',
        value: 0,
      },
    ],
    completeness: { required: 1, complete: 1, missing: 0 },
  }))
  await button(f.wrapper, '重新读取').trigger('click')
  await flushPromises()
  expect(f.wrapper.text()).toContain('Visible person')
  expect(f.wrapper.get('pre').text()).toBe('0')
  const reads = f.calls.length
  vi.spyOn(Date, 'now').mockReturnValue((expires + 1) * 1000)
  await new Promise((resolve) => setTimeout(resolve, 1100))
  await flushPromises()
  expect(f.wrapper.text()).not.toContain('Visible person')
  expect(f.wrapper.find('pre').exists()).toBe(false)
  expect(f.wrapper.text()).toContain('已过期')
  expect(f.calls).toHaveLength(reads)
})
