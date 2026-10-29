import { createFeatureRouter as createRouter } from '../../tests/feature-router'
import { decodeRunEvidence } from './policies/clients/runs'
import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, shallowRef } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { VSelect, VTextField, VTextarea } from 'vuetify/components'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { decodeMdmError } from '@rss/api/mdm'
import type { IdentitySession } from '@rss/auth'
import { mdmKey } from '../context'
import { mdmI18n } from '../i18n'
import { useOriginalOperation } from '../services/useOriginalOperation'
import { createCredentialsClient, material } from './security/clients/credentials'
import WebhookSubscriptionsPanel from './settings/components/WebhookSubscriptionsPanel.vue'
import ApiAccessPanel from './settings/components/ApiAccessPanel.vue'
import LifecyclePoliciesView from './policies/views/LifecyclePoliciesView.vue'
import ManagementQueries from './devices/components/ManagementQueries.vue'
import RetirementDetails from './devices/components/RetirementDetails.vue'
import CredentialsPanel from './security/components/CredentialsPanel.vue'
import { createPoliciesClient } from './policies/clients/policies'
import { defaultSchedule, policyAction } from './policies/clients/model'
import { createLifecycleClient, retirement } from './devices/clients/lifecycle'
import { memberships, ddmPage } from './devices/clients/management-queries'
import {
  createWebhookSubscriptions,
  subscription,
  webhookSettings,
} from './settings/clients/webhookSubscriptions'
import { createApiAccess, keyMetadata } from './settings/clients/apiAccess'
const a = '11111111-1111-4111-8111-111111111111',
  b = '22222222-2222-4222-8222-222222222222',
  c = '33333333-3333-4333-8333-333333333333'
function transport(reply: unknown | ((o: RequestOptions<unknown>) => unknown)) {
  const calls: RequestOptions<unknown>[] = []
  const client = {
    request: async (o: RequestOptions<unknown>) => {
      calls.push(o)
      return o.decode(
        typeof reply === 'function' ? (reply as (o: RequestOptions<unknown>) => unknown)(o) : reply,
      )
    },
  } as HttpTransport
  return { client, calls }
}
const entry = {
  id: a,
  binding: {
    device: 'mac',
    registration: b,
    generation: 2,
    subject: { kind: 'filevault', custody: a, epoch: 1 },
  },
  version: 3,
  current: true,
  validity: 'unknown',
  escrowed: true,
  operation: c,
  createdAt: 4,
  invalidatedAt: null,
}
it('binds credential versions to the device and accepts escrow without claiming verified validity', async () => {
  const f = transport({ items: [entry], nextCursor: null }),
    client = createCredentialsClient(f.client)
  const page = await client.list('mac', { cursor: 'YQ' })
  expect(page.items[0]).toMatchObject({ escrowed: true, validity: 'unknown', version: 3 })
  expect(f.calls[0]?.query).toEqual({ limit: 100, cursor: 'YQ' })
  expect(() => material(entry, 'other')).toThrow()
  expect(() => material({ ...entry, grant: 'old-approval' }, 'mac')).toThrow()
})
it('discloses only the exact version, without old approvals or single-line restrictions on valid secrets', async () => {
  const f = transport({ material: entry, secret: 'line one\nline two' }),
    client = createCredentialsClient(f.client)
  expect((await client.reveal('mac', material(entry, 'mac'))).secret).toContain('\n')
  expect(f.calls[0]).toMatchObject({
    method: 'GET',
    pathParams: { device: 'mac', id: a, version: 3 },
  })
  expect(f.calls[0]?.body).toBeUndefined()
  const wrong = createCredentialsClient(
    transport({ material: { ...entry, version: 4 }, secret: 'secret' }).client,
  )
  await expect(wrong.reveal('mac', material(entry, 'mac'))).rejects.toThrow()
})
it('keeps lifecycle actions resource-free and rejects illegal automatic retirement triggers', () => {
  const action = { kind: 'unmanage_device', schedule: defaultSchedule(), runLifetimeSeconds: 3600 }
  expect(policyAction(action)).toMatchObject(action)
  expect(() => policyAction({ ...action, resource: {} })).toThrow()
  expect(() =>
    policyAction({
      ...action,
      schedule: { ...defaultSchedule(), trigger: { kind: 'check_in', minimumSeconds: 60 } },
    }),
  ).toThrow()
  expect(
    policyAction({
      kind: 'credential',
      operation: { kind: 'rotate_bitlocker', volume: 'volume-id', protector: a },
      architecture: 'x86_64',
      schedule: defaultSchedule(),
      frequency: 'once_per_version',
      runLifetimeSeconds: 3600,
    }),
  ).toMatchObject({ operation: { protector: a } })
})
it('decodes the current nullable preview and retained assignment facts', async () => {
  const action = {
      kind: 'unmanage_device' as const,
      schedule: defaultSchedule(),
      runLifetimeSeconds: 3600,
    },
    definition = { customEvent: null, alias: null, scope: a, action }
  const row = {
    object: { kind: 'endpoint', id: 'mac' },
    channel: null,
    target: null,
    availability: 'unavailable',
    reason: 'source_removed',
    eligibility: { state: 'excluded' },
    qualification: { state: 'excluded' },
    sources: [],
    scopeResult: null,
    taskAdmission: null,
    operationIds: [b],
  }
  const previewRow = {
    object: row.object,
    channel: null,
    target: null,
    availability: row.availability,
    reason: row.reason,
    eligibility: row.eligibility,
    taskAdmission: null,
  }
  const f = transport({ action, scopeResult: a, items: [previewRow], nextCursor: null })
  expect(
    (await createPoliciesClient(f.client).preview({ definition })).items[0]?.channel,
  ).toBeNull()
  const retained = Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'eligibility'))
  const normal = transport({ items: [retained], nextCursor: null })
  expect(
    (await createPoliciesClient(normal.client).assignments(a)).items[0]?.scopeResult,
  ).toBeNull()
  expect((await createPoliciesClient(normal.client).assignments(a)).items[0]?.channel).toBeNull()
})
it('queries capabilities and preserves the server-owned MDM disabled error as a known rejection', async () => {
  const f = transport({ defaultSoftwareChannel: 'agent', mdmSoftwareDistributionEnabled: false })
  expect(await createPoliciesClient(f.client).capabilities()).toEqual({
    defaultSoftwareChannel: 'agent',
    mdmSoftwareDistributionEnabled: false,
  })
  expect(decodeMdmError(409, { code: 'mdm_software_disabled' })).toMatchObject({
    code: 'mdm_software_disabled',
    cause: 'wire',
  })
})
it('keeps policy-directory cursor filters separate from ID pagination and validates trigger receipts', async () => {
  const f = transport((o: RequestOptions<unknown>) =>
      o.path.endsWith('/reruns')
        ? { operationId: b, policyId: a, versionId: c, deadline: 100 }
        : { items: [], nextCursor: null },
    ),
    client = createPoliciesClient(f.client)
  await client.list({
    cursor: 'YWJj',
    filter: `state=='archived';scope=='${b}';category=='retirement'`,
  })
  expect(f.calls[0]?.query).toMatchObject({
    cursor: 'YWJj',
    filter: `state=='archived';scope=='${b}';category=='retirement'`,
  })
  expect(await client.rerun(a, b, 7, 100)).toMatchObject({ operationId: b })
  expect(f.calls[1]?.body).toEqual({
    operationId: b,
    expectedRevision: 7,
    input: { deadline: 100 },
  })
})
it('keeps retirement cleanup unknown after forced revocation and validates asset receipts', async () => {
  const value = retirement(
    {
      id: a,
      origin: 'policy',
      policy: b,
      version: c,
      target: {
        object: { kind: 'endpoint', id: 'mac' },
        verified: true,
        associationVersion: null,
        members: [{ device: 'mac', channel: 'mdm', registrationId: b, generation: 2 }],
      },
      createdAt: 1,
      forcedAt: 2,
      channels: [
        {
          device: 'mac',
          channel: 'mdm',
          registration: b,
          generation: 2,
          parentRegistration: null,
          stage: 'complete',
          effect: 'unknown',
          execution: null,
          blockingExecution: c,
          reason: 'forced_revoke_cleanup_unconfirmed',
        },
      ],
    },
    a,
  )
  expect(value.channels[0]).toMatchObject({ stage: 'complete', effect: 'unknown' })
  const f = transport({ operationId: b, devices: ['mac'], state: 'archived' })
  expect(
    await createLifecycleClient(f.client).asset({ kind: 'endpoint', id: 'mac' }, b, 'archived'),
  ).toMatchObject({ state: 'archived' })
})
const settings = {
  presentation: { name: 'Receiver', vendor: { nested: ['retained'] } },
  endpoint: 'https://receiver.test/hook',
  eventTypes: ['device.retired'],
  selection: { kind: 'devices', ids: ['mac'] },
  keyReference: 'signing',
  networkReference: 'enterprise',
}
it('preserves webhook presentation extensions while refusing credential-bearing endpoints and old envelopes', () => {
  expect(webhookSettings(settings).presentation).toEqual(settings.presentation)
  for (const endpoint of [
    'http://receiver.test/',
    'https://user:password@receiver.test/',
    'https://receiver.test/?key=secret',
    'https://receiver.test/#secret',
  ])
    expect(() => webhookSettings({ ...settings, endpoint })).toThrow()
  expect(() => subscription({ contract: 'candidate', ...settings })).toThrow()
})
it('uses body operation IDs for webhook writes and supports empty authorized pages with continuation', async () => {
  const f = transport((o: RequestOptions<unknown>) =>
      o.path.endsWith('/redrive')
        ? { id: a, operationId: b, status: 'redriven', recoveryVersion: 4 }
        : { items: [], nextCursor: c },
    ),
    client = createWebhookSubscriptions(f.client)
  expect(await client.deliveries()).toEqual({ items: [], nextCursor: c })
  expect(await client.write(b, { kind: 'redrive', id: a, expectedVersion: 3 })).toMatchObject({
    status: 'redriven',
    recoveryVersion: 4,
  })
  expect(f.calls[1]?.body).toEqual({ operationId: b, expectedVersion: 3 })
  expect(f.calls[1]?.headers).toEqual({ 'Content-Type': 'application/json' })
})
it('separates Key management from platform network policy and never accepts elevated Key grants', async () => {
  const metadata = {
    name: 'Inventory',
    enabled: false,
    expiresAt: null,
    grants: [{ operation: 'inventory_read', scope: { kind: 'device', id: 'mac' } }],
  }
  expect(() =>
    keyMetadata({
      ...metadata,
      grants: [{ operation: 'authorization_write', scope: { kind: 'tenant' } }],
    }),
  ).toThrow()
  const f = transport((o: RequestOptions<unknown>) =>
      o.path.endsWith('network-policy')
        ? { revision: 1, networks: [] }
        : { receipt: { id: a, revision: 1, deleted: false }, secret: null },
    ),
    client = createApiAccess(f.client, b)
  expect(
    await client.change(c, { kind: 'create', id: a, revision: 0, metadata: keyMetadata(metadata) }),
  ).toMatchObject({ secret: null })
  expect(await client.changeNetwork(c, 0, [])).toEqual({ revision: 1, networks: [] })
  expect(f.calls[1]?.path).toBe('/api/v1/tenant-administration/api-access/network-policy')
})
it('preserves stale memberships and no-current-registration DDM without inventing device success', () => {
  expect(
    ddmPage({
      items: [],
      nextCursor: null,
      availability: 'no_current_registration',
      effect: 'unverified',
      compliance: 'unknown',
    }),
  ).toMatchObject({ effect: 'unverified' })
  expect(memberships({ items: [], nextCursor: 'opaque', associationCurrent: false })).toEqual({
    items: [],
    nextCursor: 'opaque',
    associationCurrent: false,
  })
})
const wrappers: VueWrapper[] = []
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function session() {
  return {
    state: shallowRef({
      status: 'authenticated',
      tenant: a,
      identity: { principalId: b },
      session: { id: c },
    }),
  } as unknown as IdentitySession
}
async function mountAt(
  component: ReturnType<typeof defineComponent> | typeof CredentialsPanel,
  runtime: object,
  props = {},
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component },
      {
        path: '/execution/:execution',
        name: 'policy-execution',
        component: { template: '<div />' },
      },
      { path: '/policies', name: 'policy-policies', component: { template: '<div />' } },
      { path: '/lifecycle', name: 'policy-lifecycle', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  const wrapper = mount(component, {
    props,
    global: { plugins: [router, mdmI18n()], provide: { [mdmKey as symbol]: runtime } },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
it('retains an unknown original request across SPA remount and only explicitly resends the same identity and input', async () => {
  const s = session(),
    request = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost'))
      .mockResolvedValueOnce({ accepted: true })
  let op!: ReturnType<typeof useOriginalOperation>
  const component = defineComponent({
    setup() {
      op = useOriginalOperation(() => 'test')
      return () => null
    },
  })
  const first = await mountAt(component, { session: s })
  await op.submit({ revision: 4 }, request, () => {})
  const original = structuredClone(request.mock.calls[0])
  expect(op.pending.value?.state).toBe('unknown')
  await op.submit({ revision: 99 }, request, () => {})
  expect(request).toHaveBeenCalledTimes(1)
  first.unmount()
  await mountAt(component, { session: s })
  expect(op.locked.value).toBe(true)
  await op.submit({ revision: 99 }, request, () => {}, true)
  expect(request.mock.calls[1]).toEqual(original)
  expect(op.pending.value).toBeUndefined()
})
it('drops previous-session operation records and fences late results', async () => {
  const s = session()
  let op!: ReturnType<typeof useOriginalOperation>, resolve!: (v: string) => void
  const component = defineComponent({
    setup() {
      op = useOriginalOperation(() => 'test')
      return () => null
    },
  })
  await mountAt(component, { session: s })
  const apply = vi.fn(),
    task = op.submit(
      {},
      () =>
        new Promise<string>((r) => {
          resolve = r
        }),
      apply,
    )
  ;(s.state as ReturnType<typeof shallowRef>).value = { status: 'anonymous' }
  await flushPromises()
  resolve('old response')
  await task
  expect(apply).not.toHaveBeenCalled()
  expect(op.pending.value).toBeUndefined()
})
it('clears disclosed secrets on hiding and refuses late disclosure responses', async () => {
  const s = session()
  let resolve!: (v: unknown) => void
  const reveal = vi
    .fn()
    .mockResolvedValueOnce({ material: entry, secret: 'temporary-secret' })
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
  const wrapper = await mountAt(
    CredentialsPanel,
    {
      tenant: a,
      session: s,
      security: {
        credentials: {
          list: async () => ({ items: [material(entry, 'mac')], nextCursor: null }),
          reveal,
        },
      },
    },
    { endpoint: { id: 'mac', channels: [], primaryMdmRegistration: null } },
  )
  const button = (text: string) => wrapper.findAll('button').find((b) => b.text() === text)!
  await button('读取').trigger('click')
  await flushPromises()
  await button('查阅明文').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('temporary-secret')
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
  document.dispatchEvent(new Event('visibilitychange'))
  await flushPromises()
  expect(wrapper.text()).not.toContain('temporary-secret')
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  await button('查阅明文').trigger('click')
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
  document.dispatchEvent(new Event('visibilitychange'))
  resolve({ material: entry, secret: 'late-secret' })
  await flushPromises()
  expect(wrapper.text()).not.toContain('late-secret')
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})

it('renders credential outcomes without confusing escrow or recovered mutation with verified device effects', () => {
  const base = {
    state: {
      delivery: { kind: 'queued' },
      execution: 'succeeded',
      cancellation: 'none',
      deadline: 100,
      startedAt: null,
    },
    effect: 'unverified',
  }
  expect(
    decodeRunEvidence({
      ...base,
      result: {
        recovery: null,
        failure: null,
        definitionDigest: Array(32).fill(1),
        complete: true,
        items: [
          { subject: { kind: 'bitlocker', volume: 'volume', protector: a }, outcome: 'escrowed' },
        ],
        diagnostics: null,
      },
    }),
  ).toMatchObject({
    effect: 'unverified',
    result: { kind: 'credential', items: [{ outcome: 'escrowed' }] },
  })
  expect(
    decodeRunEvidence({
      ...base,
      effect: 'applied',
      result: { effect: 'applied', recoveredByTask: b, recoveredByAttempt: c, diagnostics: null },
    }),
  ).toMatchObject({ effect: 'applied', result: { kind: 'credential_recovery' } })
})

function button(w: Pick<VueWrapper, 'findAll'>, label: string) {
  return w.findAll('button').find((b) => b.text() === label)!
}
async function confirm(w: VueWrapper) {
  await w.findAll('input[type="checkbox"]').at(-1)!.setValue(true)
}
async function seedPending(
  runtime: object,
  key: string,
  input: unknown,
  rejection = new Error('lost response'),
) {
  let op!: ReturnType<typeof useOriginalOperation>
  const component = defineComponent({
    setup() {
      op = useOriginalOperation(() => key)
      return () => null
    },
  })
  const w = await mountAt(component, runtime)
  await op.submit(
    input,
    async () => {
      throw rejection
    },
    () => {},
  )
  const id = op.pending.value!.id
  w.unmount()
  return id
}
it('revokes an exact Windows credential through the shared confirmation without cloning a Vue proxy', async () => {
  const windows = material(
    {
      ...entry,
      binding: {
        ...entry.binding,
        device: 'win',
        subject: { kind: 'bitlocker', volume: 'volume', protector: a },
      },
    },
    'win',
  )
  const revoke = vi.fn(async () => ({ ...windows, validity: 'revoked' }))
  const w = await mountAt(
    CredentialsPanel,
    {
      tenant: a,
      session: session(),
      security: {
        credentials: { list: async () => ({ items: [windows], nextCursor: null }), revoke },
      },
    },
    { endpoint: { id: 'win', channels: [], primaryMdmRegistration: null } },
  )
  await button(w, '读取').trigger('click')
  await flushPromises()
  expect(button(w, '撤销').attributes('disabled')).toBeDefined()
  await confirm(w)
  await button(w, '撤销').trigger('click')
  await flushPromises()
  expect(revoke).toHaveBeenCalledWith('win', windows)
})
it.each(['create', 'update'] as const)(
  'replays an unknown Key %s after SPA remount using the original input',
  async (kind) => {
    const input = {
      kind,
      id: a,
      revision: kind === 'create' ? 0 : 3,
      metadata: {
        name: 'original',
        enabled: true,
        expiresAt: null,
        grants: [{ operation: 'inventory_read', scope: { kind: 'all_devices' } }],
      },
    }
    const change = vi.fn(async () => ({
      receipt: { id: a, revision: 4, deleted: false },
      secret: null,
    }))
    const runtime = {
      tenant: a,
      realm: 'tenant',
      session: session(),
      settings: { apiAccess: { change } },
      operations: {
        authorization: {
          effective: async () => ({
            principalId: b,
            grants: [{ operation: 'authorization_write', scope: { kind: 'tenant' } }],
          }),
        },
      },
    }
    const originalId = await seedPending(runtime, 'api-access', input)
    const w = await mountAt(ApiAccessPanel, runtime)
    expect(change).not.toHaveBeenCalled()
    expect(w.text()).toContain(originalId)
    await confirm(w)
    await button(w, '重送原请求').trigger('click')
    await flushPromises()
    expect(change).toHaveBeenCalledWith(originalId, input)
    expect(w.text()).not.toContain(originalId)
  },
)
it.each(['change', 'trigger'] as const)(
  'restores lifecycle %s after SPA remount without requiring a new locator or current form',
  async (type) => {
    const definition = {
      customEvent: null,
      alias: null,
      scope: a,
      action: { kind: 'unmanage_device', schedule: defaultSchedule(), runLifetimeSeconds: 3600 },
    }
    const input =
      type === 'change'
        ? { type, id: a, expectedRevision: 0, input: { action: 'put', definition, enabled: false } }
        : { type, id: a, revision: 4, deadline: 4000 }
    const p = { id: a, revision: 4, definition, enabled: false, state: 'disabled' }
    const change = vi.fn(async () => p),
      rerun = vi.fn(async () => ({ operationId: c }))
    const runtime = {
      tenant: a,
      session: session(),
      policies: {
        policies: {
          list: async () => ({ items: [], nextCursor: null }),
          change,
          rerun,
          read: async () => p,
          assignments: async () => ({ items: [], nextCursor: null }),
        },
      },
    }
    const originalId = await seedPending(runtime, 'lifecycle-policy', input)
    const w = await mountAt(LifecyclePoliciesView, runtime)
    expect(w.text()).toContain(originalId)
    expect(change).not.toHaveBeenCalled()
    expect(rerun).not.toHaveBeenCalled()
    await confirm(w)
    await button(w, '重送原请求').trigger('click')
    await flushPromises()
    if (type === 'change')
      expect(change).toHaveBeenCalledWith(a, {
        operationId: originalId,
        expectedRevision: 0,
        input: input.input,
      })
    else expect(rerun).toHaveBeenCalledWith(a, originalId, 4, 4000)
    expect(w.text()).not.toContain(originalId)
  },
)
it('unlocks an asset conflict only after reading the current authoritative state', async () => {
  const asset = vi
    .fn()
    .mockRejectedValueOnce(decodeMdmError(409, { code: 'operation_conflict' }))
    .mockResolvedValueOnce({ operationId: b, devices: ['mac'], state: 'archived' })
  const detail = vi.fn(async () => ({ endpoints: [{ assetState: 'active' }] }))
  const runtime = {
    tenant: a,
    session: session(),
    devices: { lifecycle: { asset }, views: { detail }, management: {} },
  }
  const w = await mountAt(ManagementQueries, runtime, { device: 'mac' })
  await confirm(w)
  await button(w, '保存').trigger('click')
  await flushPromises()
  expect(select(w, '资产状态').props('disabled')).toBe(true)
  await button(w, '冲突：重新读取并比较后编辑').trigger('click')
  await flushPromises()
  expect(detail).toHaveBeenCalledWith({ kind: 'endpoint', id: 'mac' })
  expect(w.text()).toContain('active')
  expect(select(w, '资产状态').props('disabled')).toBe(false)
  await select(w, '资产状态').setValue('archived')
  await confirm(w)
  await button(w, '保存').trigger('click')
  await flushPromises()
  expect(asset.mock.calls[1]?.[2]).toBe('archived')
  expect(w.text()).toContain('资产状态: archived')
  expect(w.text()).not.toContain('资产状态: active')
})
it('renders nonempty redacted DDM facts, unknown observation and the exact operation link across opaque pages', async () => {
  const observation = {
    protocol: 'mdm.apple',
    observationScope: 'declarations',
    progress: 'received',
    effect: 'unverified',
    compliance: 'unknown',
    synchronization: 'published',
    inputVersion: 'v1',
    expected: { Activations: [], Assets: [], Configurations: [], Management: [] },
    nativeStatus: {
      items: {},
      unknownItems: [],
      declarations: [],
      errors: [],
      completeness: 'unknown',
      effect: 'unverified',
      synchronized: false,
      compliance: 'unknown',
    },
  }
  const page = {
    items: [
      {
        operationId: a,
        registrationId: b,
        generation: 7,
        channel: 'mdm.apple',
        userKey: '',
        nativeValuesRedacted: true,
        observation,
      },
    ],
    nextCursor: 'opaque-ddm-cursor',
    availability: 'current_registration',
    effect: 'unverified',
    compliance: 'unknown',
  }
  const decoded = ddmPage(page)
  expect(decoded.items[0]).toMatchObject({ generation: 7, nativeValuesRedacted: true, observation })
  const ddm = vi
    .fn()
    .mockResolvedValueOnce(decoded)
    .mockResolvedValueOnce(ddmPage({ ...page, items: [], nextCursor: null }))
  const w = await mountAt(
    ManagementQueries,
    { tenant: a, session: session(), devices: { management: { ddm } } },
    { device: 'mac' },
  )
  await w
    .findAll('button')
    .filter((b) => b.text() === '读取')[1]!
    .trigger('click')
  await flushPromises()
  expect(w.text()).toContain(b + ' / 7')
  expect(w.text()).toContain('unverified')
  expect(w.text()).toContain('unknown')
  expect(w.find(`a[href="/execution/${a}?device=mac"]`).exists()).toBe(true)
  await button(w, '下一页').trigger('click')
  await flushPromises()
  expect(ddm).toHaveBeenLastCalledWith('mac', 'opaque-ddm-cursor')
  expect(w.findAll('article')).toHaveLength(0)
})

function authority(operations: string[]) {
  return {
    authorization: {
      effective: async () => ({
        principalId: b,
        grants: operations.map((operation) => ({ operation, scope: { kind: 'tenant' } })),
      }),
    },
  }
}
function field(w: VueWrapper, label: string) {
  const controls = [...w.findAllComponents(VTextField), ...w.findAllComponents(VTextarea)]
  const control =
    controls.find((control) => control.props().label === label) ??
    controls.find((control) => String(control.props().label ?? '').startsWith(label))
  if (control) return control.get('input:not([type="hidden"]), textarea')
  const container =
    w.findAll('label').find((l) => l.text() === label) ??
    w.findAll('label').find((l) => l.text().startsWith(label))
  if (!container) throw new Error(`Missing field label: ${label}`)
  const nested = container.find('input, textarea')
  if (nested.exists()) return nested
  const id = container.attributes('for')
  const input = w.findAll('input, textarea').find((input) => input.attributes('id') === id)
  if (!id || !input) throw new Error(`Missing labelled input: ${label}`)
  return input
}
function select(w: VueWrapper, label: string, index = 0) {
  const direct = w.findAllComponents(VSelect).filter((control) => {
    const value = control.props('label')
    return typeof value === 'string' && value.startsWith(label)
  })
  const wrapped = w
    .findAll('label')
    .filter((candidate) => candidate.text().startsWith(label))
    .map((candidate) => candidate.findComponent(VSelect))
    .filter((control) => control.exists())
  const control = [...direct, ...wrapped][index]
  if (!control) throw new Error(`Missing labelled select: ${label} (${index})`)
  return control
}
function expectCredentialEditorDisabled(w: VueWrapper, disabled: boolean) {
  const inputs = w.get('form').findAll('input:not([type="hidden"])')
  expect(inputs.length).toBeGreaterThan(0)
  for (const input of inputs) expect(input.element).toHaveProperty('disabled', disabled)
}
it('edits webhook metadata without losing extensions and consumes actual replay and redrive receipts', async () => {
  let record = { id: a, revision: 1, targetVersion: 1, enabled: false, deleted: false, settings }
  const d = {
    id: b,
    eventId: c,
    subscriptionId: a,
    targetVersion: 1,
    recoveryVersion: 3,
    redriveWindowOpen: true,
    sourceDelivery: null,
    attempts: 2,
    status: 'pending',
    transportObservation: 'received',
    failureStage: 'transport',
    failureReason: 'gone',
  }
  const f = transport((o: RequestOptions<unknown>) => {
    if (o.path.endsWith('/event-types'))
      return {
        version: 1,
        items: [
          'device.registered',
          'device.retired',
          'policy.execution.terminal',
          'compliance.status.changed',
          'device.access.changed',
        ],
      }
    if (o.path.endsWith('/deliveries/{id}/replay')) return { id: c, eventId: c, sourceDelivery: b }
    if (o.path.endsWith('/deliveries/{id}/redrive'))
      return {
        id: b,
        operationId: (o.body as { operationId: string }).operationId,
        status: 'redriven',
        recoveryVersion: 4,
      }
    if (o.path.endsWith('/deliveries') || o.path.endsWith('/deliveries/{id}'))
      return { items: [d], nextCursor: null }
    if (o.path.endsWith('/test')) return { id: b, eventId: c }
    if (o.method === 'PUT') {
      const body = o.body as {
        change: { kind: string; value: typeof settings | boolean }
        expectedRevision: number
      }
      record = { ...record, revision: body.expectedRevision + 1 }
      if (body.change.kind === 'put') record.settings = body.change.value as typeof settings
      if (body.change.kind === 'enabled') record.enabled = body.change.value as boolean
      if (body.change.kind === 'delete') record.deleted = true
    }
    return o.path.endsWith('/subscriptions') ? { items: [record], nextCursor: null } : record
  })
  const client = createWebhookSubscriptions(f.client)
  const w = await mountAt(WebhookSubscriptionsPanel, {
    tenant: a,
    session: session(),
    settings: { subscriptions: client },
    operations: authority(['webhook_read', 'webhook_write', 'webhook_replay']),
  })
  await button(w, '读取').trigger('click')
  await flushPromises()
  await w
    .findAll('button')
    .find((x) => x.text().startsWith('Receiver ·'))!
    .trigger('click')
  await flushPromises()
  await field(w, '名称').setValue('Updated receiver')
  await field(w, 'HTTPS').setValue('https://receiver.test/new')
  await select(w, '设备范围').setValue('groups')
  await w.find('textarea').setValue(c)
  await w.find('input[value="device.retired"]').setValue(true)
  await field(w, '签名').setValue('signing-next')
  await field(w, '网络').setValue('network-next')
  await confirm(w)
  await w.find('form').trigger('submit')
  await flushPromises()
  expect(record.settings.presentation).toEqual({
    name: 'Updated receiver',
    vendor: { nested: ['retained'] },
  })
  expect(record.settings.selection).toEqual({ kind: 'groups', ids: [c] })
  await confirm(w)
  await button(w, '启用').trigger('click')
  await flushPromises()
  await field(w, '设备').setValue('mac')
  await confirm(w)
  await button(w, '测试投递').trigger('click')
  await flushPromises()
  expect(f.calls.find((x) => x.path.endsWith('/test'))?.body).toMatchObject({ deviceId: 'mac' })
  await w
    .findAll('button')
    .filter((x) => x.text() === '读取')
    .at(-1)!
    .trigger('click')
  await flushPromises()
  await w
    .findAll('button')
    .find((x) => x.text().startsWith(b + ' ·'))!
    .trigger('click')
  await flushPromises()
  await confirm(w)
  expect(button(w, '创建重放投递').attributes('disabled')).toBeDefined()
  expect(button(w, '恢复原投递').attributes('disabled')).toBeDefined()
  d.status = 'dead_letter'
  await w
    .findAll('button')
    .find((x) => x.text().startsWith(b + ' ·'))!
    .trigger('click')
  await flushPromises()
  await confirm(w)
  await button(w, '创建重放投递').trigger('click')
  await flushPromises()
  expect(w.text()).toContain('sourceDelivery')
  await confirm(w)
  await button(w, '恢复原投递').trigger('click')
  await flushPromises()
  expect(w.text()).toContain('redriven')
  expect(f.calls.find((x) => x.path.endsWith('/redrive'))?.body).toMatchObject({
    expectedVersion: 3,
  })
  await confirm(w)
  await button(w, '软删除').trigger('click')
  await flushPromises()
  expect(record.deleted).toBe(true)
  await button(w, '新建').trigger('click')
  await flushPromises()
  expect(field(w, '名称').element).toHaveProperty('value', '')
})
it('reads and rotates a Key with a local first-response secret, then revokes using the current revision', async () => {
  const metadata = {
    name: 'Inventory',
    enabled: true,
    expiresAt: null,
    grants: [{ operation: 'inventory_read', scope: { kind: 'all_devices' } }],
  }
  const key = {
    id: a,
    revision: 1,
    authorityRevision: 1,
    credentialRevision: 1,
    metadata,
    createdBy: { instanceId: c, tenantId: a, principalId: b },
    createdAt: 1,
    revoked: false,
  }
  const f = transport((o: RequestOptions<unknown>) => {
    if (o.path.endsWith('/api-keys'))
      return {
        items: [
          { ...key, name: metadata.name, enabled: metadata.enabled, expiresAt: metadata.expiresAt },
        ],
        nextCursor: null,
      }
    if (o.method === 'GET') return key
    const body = o.body as { expectedRevision: number }
    return {
      receipt: { id: a, revision: body.expectedRevision + 1, deleted: o.path.endsWith('/revoke') },
      secret: o.path.endsWith('/rotate') ? 'first-response-secret' : null,
    }
  })
  const client = createApiAccess(f.client, a)
  const w = await mountAt(ApiAccessPanel, {
    tenant: a,
    realm: 'tenant',
    session: session(),
    settings: { apiAccess: client },
    operations: authority(['authorization_read', 'authorization_write']),
  })
  await button(w, '读取').trigger('click')
  await flushPromises()
  await w
    .findAll('button')
    .find((x) => x.text().startsWith('Inventory ·'))!
    .trigger('click')
  await flushPromises()
  await confirm(w)
  await button(w, '轮换').trigger('click')
  await flushPromises()
  expect(w.find('output').text()).toBe('first-response-secret')
  window.dispatchEvent(new Event('pagehide'))
  await flushPromises()
  expect(w.find('output').exists()).toBe(false)
  await w
    .findAll('button')
    .filter((x) => x.text() === '读取')[1]!
    .trigger('click')
  await flushPromises()
  await confirm(w)
  await button(w, '撤销').trigger('click')
  await flushPromises()
  expect(f.calls.find((x) => x.path.endsWith('/revoke'))?.body).toMatchObject({
    expectedRevision: 1,
  })
  await button(w, '新草稿').trigger('click')
  await flushPromises()
  expect(field(w, '名称').element).toHaveProperty('value', '')
})
it('compares a platform network conflict, then writes the newly read revision and CIDRs', async () => {
  const network = vi
    .fn()
    .mockResolvedValueOnce({ revision: 1, networks: ['127.0.0.1/32'] })
    .mockResolvedValueOnce({ revision: 2, networks: [] })
  const changeNetwork = vi
    .fn()
    .mockRejectedValueOnce(decodeMdmError(409, { code: 'operation_conflict' }))
    .mockResolvedValueOnce({ revision: 3, networks: ['::1/128'] })
  const w = await mountAt(ApiAccessPanel, {
    tenant: a,
    realm: 'platform',
    session: session(),
    settings: { apiAccess: { network, changeNetwork } },
    operations: authority(['authorization_read', 'authorization_write']),
  })
  await button(w, '读取').trigger('click')
  await flushPromises()
  await w.find('textarea').setValue('::1/128')
  await confirm(w)
  await w.find('form').trigger('submit')
  await flushPromises()
  await button(w, '冲突：重新读取并比较后编辑').trigger('click')
  await flushPromises()
  expect(w.find('textarea').element).toHaveProperty('value', '')
  await w.find('textarea').setValue('::1/128')
  await confirm(w)
  await w.find('form').trigger('submit')
  await flushPromises()
  expect(changeNetwork.mock.calls[1]?.slice(1)).toEqual([2, ['::1/128']])
})
it('creates and edits a credential Policy with the exact operation, then enables, triggers, disables and archives it', async () => {
  let policy = {
    id: a,
    revision: 0,
    enabled: false,
    state: 'disabled',
    definition: {
      customEvent: null as string | null,
      alias: null,
      scope: a,
      action: {
        kind: 'credential',
        operation: { kind: 'collect_bitlocker' },
        architecture: 'x86_64',
        frequency: 'once_per_version',
        schedule: defaultSchedule(),
        runLifetimeSeconds: 3600,
      },
    },
  }
  const change = vi.fn(async (id, operation) => {
    policy = { ...policy, id, revision: operation.expectedRevision + 1 }
    if (operation.input.action === 'put')
      policy = {
        ...policy,
        definition: operation.input.definition,
        enabled: operation.input.enabled,
      }
    if (operation.input.action === 'enable') policy = { ...policy, enabled: true, state: 'enabled' }
    if (operation.input.action === 'disable')
      policy = { ...policy, enabled: false, state: 'disabled' }
    if (operation.input.action === 'archive') policy = { ...policy, state: 'archived' }
    return policy
  })
  const preview = vi.fn(async () => ({ items: [], nextCursor: null, scopeResult: a })),
    rerun = vi.fn(async () => ({})),
    assignments = vi.fn(async () => ({ items: [], nextCursor: null }))
  const runtime = {
    tenant: a,
    session: session(),
    policies: {
      policies: {
        change,
        preview,
        rerun,
        assignments,
        read: async () => policy,
        list: async () => ({ items: [], nextCursor: null }),
      },
    },
  }
  const w = await mountAt(LifecyclePoliciesView, runtime)
  await select(w, '操作类型').setValue('credential')
  await flushPromises()
  await field(w, '策略 ID').setValue(a)
  await field(w, '设备范围 ID').setValue(a)
  await select(w, '操作类型', 1).setValue('rotate_bitlocker')
  await select(w, '处理器架构').setValue('aarch64')
  await field(w, '卷 DeviceID').setValue('volume')
  await field(w, '保护器 ID').setValue(b)
  await field(w, '账户 SID').setValue('S-1-5-21')
  await button(w, '预览').trigger('click')
  await flushPromises()
  expect(preview).toHaveBeenCalledWith(
    expect.objectContaining({
      definition: expect.objectContaining({
        action: expect.objectContaining({
          operation: { kind: 'rotate_bitlocker', volume: 'volume', protector: b },
          architecture: 'aarch64',
        }),
      }),
    }),
    { cursor: undefined },
  )
  await confirm(w)
  await w.find('form').trigger('submit')
  await flushPromises()
  expect(change.mock.calls[0]?.[1]).toMatchObject({
    expectedRevision: 0,
    input: { enabled: false },
  })
  policy.definition.customEvent = 'refresh.credentials'
  await w
    .get('form')
    .findAll('button')
    .find((b) => b.text() === '读取')!
    .trigger('click')
  await flushPromises()
  await confirm(w)
  await w.find('form').trigger('submit')
  await flushPromises()
  expect(change.mock.calls.at(-1)?.[1].input.definition.customEvent).toBe('refresh.credentials')
  await confirm(w)
  await button(w, '启用整个 Policy').trigger('click')
  await flushPromises()
  await field(w, '原操作期限').setValue('5000')
  await confirm(w)
  await button(w, '显式触发').trigger('click')
  await flushPromises()
  expect(rerun).toHaveBeenCalledWith(a, expect.any(String), expect.any(Number), 5000)
  expect(assignments).toHaveBeenCalledWith(a, { cursor: undefined })
  await confirm(w)
  await button(w, '禁用整个 Policy').trigger('click')
  await flushPromises()
  await confirm(w)
  await button(w, '已归档').trigger('click')
  await flushPromises()
  expect(policy.state).toBe('archived')
  await button(w, '新草稿').trigger('click')
  await flushPromises()
  expect(field(w, '策略 ID').element).not.toHaveProperty('value', a)
})

it('compares current Apple registration and material facts before unlocking a rejected CAS operation', async () => {
  const endpoint = {
    id: 'mac',
    primaryMdmRegistration: { source: 'mdm.apple', registrationId: b, generation: 2 },
    channels: [{ channel: 'mdm', status: 'active', registrationId: b, generation: 2 }],
  }
  const current = {
    ...endpoint,
    primaryMdmRegistration: { source: 'mdm.apple', registrationId: c, generation: 3 },
    channels: [{ channel: 'mdm', status: 'active', registrationId: c, generation: 3 }],
  }
  const detail = vi
    .fn()
    .mockRejectedValueOnce(decodeMdmError(503, { code: 'unavailable' }))
    .mockResolvedValue(current)
  const list = vi.fn(async () => ({
    items: [
      material({ ...entry, binding: { ...entry.binding, registration: c, generation: 3 } }, 'mac'),
    ],
    nextCursor: null,
  }))
  const create = vi
    .fn()
    .mockRejectedValueOnce(decodeMdmError(409, { code: 'operation_conflict' }))
    .mockResolvedValue({ operationId: a, revision: 1 })
  const w = await mountAt(
    CredentialsPanel,
    {
      tenant: a,
      session: session(),
      devices: { directory: { detail } },
      security: { credentials: { create, list } },
    },
    { endpoint },
  )
  await confirm(w)
  await w.find('form').trigger('submit')
  await flushPromises()
  expectCredentialEditorDisabled(w, true)
  await button(w, '冲突：重新读取并比较后编辑').trigger('click')
  await flushPromises()
  expectCredentialEditorDisabled(w, true)
  await button(w, '冲突：重新读取并比较后编辑').trigger('click')
  await flushPromises()
  expect(detail).toHaveBeenLastCalledWith('mac')
  expect(list).toHaveBeenCalledWith('mac')
  expect(w.text()).toContain(c)
  expectCredentialEditorDisabled(w, false)
  await field(w, '预期修订').setValue(3)
  await confirm(w)
  await w.find('form').trigger('submit')
  await flushPromises()
  expect(create.mock.calls[1]?.[2]).toMatchObject({
    registration: c,
    generation: 3,
    action: { expectedRevision: 3 },
  })
  expect(create.mock.calls[1]?.[1]).not.toBe(create.mock.calls[0]?.[1])
})

it('compares the original delivery after a recovery conflict without requiring a selected subscription', async () => {
  const d = {
    id: b,
    eventId: c,
    subscriptionId: a,
    targetVersion: 1,
    recoveryVersion: 3,
    redriveWindowOpen: true,
    sourceDelivery: null,
    attempts: 2,
    status: 'dead_letter',
    transportObservation: 'notSent',
    failureStage: 'admission',
    failureReason: 'provider_rejected',
  }
  const delivery = vi
    .fn()
    .mockResolvedValueOnce(d)
    .mockRejectedValueOnce(decodeMdmError(404, { code: 'not_found' }))
    .mockResolvedValueOnce({
      ...d,
      recoveryVersion: 4,
      status: 'published',
      redriveWindowOpen: false,
    })
  const read = vi.fn(async () => {
    throw decodeMdmError(404, { code: 'not_found' })
  })
  const write = vi.fn(async () => {
    throw decodeMdmError(409, { code: 'operation_conflict' })
  })
  const w = await mountAt(WebhookSubscriptionsPanel, {
    tenant: a,
    session: session(),
    settings: {
      subscriptions: {
        deliveries: async () => ({ items: [d], nextCursor: null }),
        delivery,
        read,
        write,
      },
    },
    operations: authority(['webhook_read', 'webhook_write', 'webhook_replay']),
  })
  await w
    .findAll('button')
    .filter((x) => x.text() === '读取')
    .at(-1)!
    .trigger('click')
  await flushPromises()
  await w
    .findAll('button')
    .find((x) => x.text().startsWith(b + ' ·'))!
    .trigger('click')
  await flushPromises()
  await confirm(w)
  await button(w, '恢复原投递').trigger('click')
  await flushPromises()
  expect(button(w, '新建').attributes('disabled')).toBeDefined()
  await button(w, '冲突：重新读取并比较后编辑').trigger('click')
  await flushPromises()
  expect(button(w, '新建').attributes('disabled')).toBeDefined()
  await button(w, '冲突：重新读取并比较后编辑').trigger('click')
  await flushPromises()
  expect(read).not.toHaveBeenCalled()
  expect(delivery.mock.calls).toEqual([[b], [b], [b]])
  expect(w.text()).toContain('published')
  expect(button(w, '新建').attributes('disabled')).toBeUndefined()
})

it('reloads retirement channel facts after a confirmed force receipt leaves the write busy region', async () => {
  const before = retirement(
    {
      id: a,
      origin: 'policy',
      policy: b,
      version: c,
      target: {
        object: { kind: 'endpoint', id: 'mac' },
        verified: true,
        associationVersion: null,
        members: [{ device: 'mac', channel: 'mdm', registrationId: b, generation: 2 }],
      },
      createdAt: 1,
      forcedAt: null,
      channels: [
        {
          device: 'mac',
          channel: 'mdm',
          registration: b,
          generation: 2,
          parentRegistration: null,
          stage: 'cleanup',
          effect: 'blocked',
          execution: null,
          blockingExecution: null,
          reason: 'cleanup_blocked',
        },
      ],
    },
    a,
  )
  const after = {
    ...before,
    forcedAt: 3,
    channels: before.channels.map((v) => ({
      ...v,
      stage: 'revoke',
      effect: 'unknown',
      reason: 'forced_revoke_cleanup_unconfirmed',
    })),
  }
  const read = vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after)
  const force = vi.fn(async () => ({ operationId: b, retirementId: a, revocation: 'pending' }))
  const w = await mountAt(
    RetirementDetails,
    { tenant: a, session: session(), devices: { lifecycle: { read, force } } },
    { id: a },
  )
  expect(w.text()).toContain('cleanup_blocked')
  await field(w, '原因').setValue('explicit cleanup uncertainty')
  await confirm(w)
  await button(w, '强制撤权').trigger('click')
  await flushPromises()
  expect(force).toHaveBeenCalledWith(a, expect.any(String), 'explicit cleanup uncertainty')
  expect(read.mock.calls).toEqual([[a], [a]])
  expect(w.text()).toContain('forced_revoke_cleanup_unconfirmed')
})

it('keeps a Key conflict after a disposed comparison and reads its frozen ID on the next mount', async () => {
  const metadata = keyMetadata({
    name: 'Current key',
    enabled: true,
    expiresAt: null,
    grants: [{ operation: 'inventory_read', scope: { kind: 'all_devices' } }],
  })
  const record = {
    id: a,
    revision: 2,
    authorityRevision: 2,
    credentialRevision: 1,
    metadata,
    createdBy: { instanceId: c, tenantId: a, principalId: b },
    createdAt: 1,
    revoked: false,
  }
  let resolve!: (v: typeof record) => void
  const key = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    .mockResolvedValue(record)
  const change = vi.fn(async () => ({
    receipt: { id: a, revision: 3, deleted: false },
    secret: null,
  }))
  const runtime = {
    tenant: a,
    realm: 'tenant',
    session: session(),
    settings: { apiAccess: { key, change } },
    operations: authority(['authorization_read', 'authorization_write']),
  }
  const original = await seedPending(
    runtime,
    'api-access',
    { kind: 'update', id: a, revision: 1, metadata },
    decodeMdmError(409, { code: 'operation_conflict' }),
  )
  const first = await mountAt(ApiAccessPanel, runtime)
  await button(first, '冲突：重新读取并比较后编辑').trigger('click')
  expect(key).toHaveBeenCalledWith(a)
  first.unmount()
  resolve(record)
  await flushPromises()
  const current = await mountAt(ApiAccessPanel, runtime)
  expect(current.text()).toContain(original)
  await button(current, '冲突：重新读取并比较后编辑').trigger('click')
  await flushPromises()
  expect(key.mock.calls).toEqual([[a], [a]])
  expect(field(current, '名称').element).toHaveProperty('value', 'Current key')
  await field(current, '名称').setValue('Compared key')
  await confirm(current)
  await current.find('form').trigger('submit')
  await flushPromises()
  expect(change).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ kind: 'update', id: a, revision: 2 }),
  )
})

it('does not resolve a Policy conflict when its authoritative comparison is disposed', async () => {
  const definition = {
    customEvent: null,
    alias: null,
    scope: b,
    action: { kind: 'unmanage_device', schedule: defaultSchedule(), runLifetimeSeconds: 3600 },
  }
  const policy = { id: a, revision: 2, definition, enabled: false, state: 'disabled' }
  let resolve!: (v: typeof policy) => void
  const read = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    .mockResolvedValue(policy)
  const runtime = {
    tenant: a,
    session: session(),
    policies: { policies: { read, list: async () => ({ items: [], nextCursor: null }) } },
  }
  const original = await seedPending(
    runtime,
    'lifecycle-policy',
    {
      type: 'change',
      id: a,
      expectedRevision: 1,
      input: { action: 'put', enabled: false, definition },
    },
    decodeMdmError(409, { code: 'operation_conflict' }),
  )
  const first = await mountAt(LifecyclePoliciesView, runtime)
  await button(first, '冲突：重新读取并比较后编辑').trigger('click')
  first.unmount()
  resolve(policy)
  await flushPromises()
  const current = await mountAt(LifecyclePoliciesView, runtime)
  expect(current.text()).toContain(original)
  await button(current, '冲突：重新读取并比较后编辑').trigger('click')
  await flushPromises()
  expect(read.mock.calls).toEqual([[a], [a]])
  expect(current.text()).not.toContain(original)
  expect(field(current, '策略 ID').element).toHaveProperty('value', a)
})

it('clears lifecycle alias and event on same-route principal and session replacement before a new write', async () => {
  const actor = session()
  const policy = {
    id: a,
    revision: 1,
    version: 1,
    versionId: a,
    state: 'disabled',
    enabled: false,
    definition: {
      alias: 'previous.actor',
      customEvent: 'previous.event',
      scope: a,
      action: { kind: 'unmanage_device', schedule: defaultSchedule(), runLifetimeSeconds: 3600 },
    },
  }
  const change = vi.fn(async (id, operation) => ({
    ...policy,
    id,
    definition: operation.input.definition,
  }))
  const w = await mountAt(LifecyclePoliciesView, {
    tenant: a,
    session: actor,
    policies: {
      policies: {
        read: vi.fn().mockResolvedValue(policy),
        list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
        change,
      },
    },
  })
  await field(w, '策略 ID').setValue(a)
  await w
    .get('form')
    .findAll('button')
    .find((b) => b.text() === '读取')!
    .trigger('click')
  await flushPromises()
  expect((w.get('[data-field=policy-alias] input').element as HTMLInputElement).value).toBe(
    'previous.actor',
  )
  expect((w.get('[data-field=policy-event] input').element as HTMLInputElement).value).toBe(
    'previous.event',
  )
  ;(actor.state as ReturnType<typeof shallowRef>).value = {
    status: 'authenticated',
    tenant: a,
    identity: { principalId: c },
    session: { id: b },
  } as typeof actor.state.value
  await flushPromises()
  expect((w.get('[data-field=policy-alias] input').element as HTMLInputElement).value).toBe('')
  expect((w.get('[data-field=policy-event] input').element as HTMLInputElement).value).toBe('')
  await field(w, '设备范围 ID').setValue(a)
  await confirm(w)
  await w.get('form').trigger('submit')
  await flushPromises()
  expect(change).toHaveBeenCalledOnce()
  expect(change.mock.calls[0]?.[1].input.definition).toMatchObject({
    alias: null,
    customEvent: null,
  })
})
it('reads complete API key metadata after an id-only directory projection before editing', async () => {
  const metadata = {
    name: 'Projected key',
    enabled: true,
    expiresAt: null,
    grants: [{ operation: 'inventory_read', scope: { kind: 'all_devices' } }],
  }
  const key = {
    id: a,
    revision: 1,
    authorityRevision: 1,
    credentialRevision: 1,
    metadata,
    createdBy: { instanceId: c, tenantId: a, principalId: b },
    createdAt: 1,
    revoked: false,
  }
  const f = transport((o: RequestOptions<unknown>) =>
    o.path.endsWith('/api-keys') ? { items: [{ id: a }], nextCursor: null } : key,
  )
  const w = await mountAt(ApiAccessPanel, {
    tenant: a,
    realm: 'tenant',
    session: session(),
    settings: { apiAccess: createApiAccess(f.client, a) },
    operations: authority(['authorization_read', 'authorization_write']),
  })
  const q = w.get('.directory-query')
  await q.get('select').setValue(['id'])
  await button(q, '应用查询').trigger('click')
  await flushPromises()
  await w.get('.directory-results button').trigger('click')
  await flushPromises()
  expect(f.calls.at(-1)?.path).toBe('/api/v1/api-keys/{id}')
  await field(w, '名称').setValue('Edited projection')
  await field(w, '到期时间').setValue(1000)
  await w.get('form input[type=checkbox]').setValue(false)
  expect(field(w, '名称').element).toHaveProperty('value', 'Edited projection')
})
it('reads exact complete recovery metadata after an id/version-only projection and retains its Apple action form', async () => {
  const f = transport((o: RequestOptions<unknown>) => ({
    items: [o.query?.['fields'] ? { id: a, version: 3 } : entry],
    nextCursor: null,
  }))
  const endpoint = {
    id: 'mac',
    status: 'active',
    primaryMdmRegistration: { registrationId: b, generation: 2, source: 'mdm.apple' },
    channels: [],
    enrollments: [],
  }
  const w = await mountAt(
    CredentialsPanel,
    { tenant: a, session: session(), security: { credentials: createCredentialsClient(f.client) } },
    { endpoint },
  )
  const q = w.get('.directory-query')
  await q.get('select').setValue(['id', 'version'])
  await button(q, '应用查询').trigger('click')
  await flushPromises()
  await w.get('.directory-results button').trigger('click')
  await flushPromises()
  expect(f.calls.at(-1)?.query?.['filter']).toContain('version')
  await select(w, '操作类型').setValue('set_recovery_lock')
  for (const [label, value] of [
    ['接收者引用', 'recipient'],
    ['材料 ID', a],
    ['版本', 3],
    ['预期修订', 2],
  ])
    await field(w, String(label)).setValue(value)
  await w
    .findAllComponents({ name: 'VCheckbox' })
    .find((c) => c.props('label') === '清除明文')
    ?.setValue(true)
  await select(w, '操作类型').setValue('reconcile_recovery_lock')
  await field(w, '操作').setValue(c)
  await select(w, '操作类型').setValue('rotate_filevault')
  await field(w, '解锁密码').setValue('Synthetic private input')
  expect(w.text()).toContain('材料与有效性')
})
it('opens full webhook and delivery objects from independent id-only directory projections', async () => {
  const record = { id: a, revision: 1, targetVersion: 1, enabled: true, deleted: false, settings }
  const delivery = {
    id: b,
    eventId: c,
    subscriptionId: a,
    targetVersion: 1,
    recoveryVersion: 1,
    attempts: 1,
    status: 'pending',
    sourceDelivery: null,
    redriveWindowOpen: false,
    transportObservation: 'unknown',
    failureStage: null,
    failureReason: null,
  }
  const f = transport((o: RequestOptions<unknown>) => {
    if (o.path.endsWith('/event-types'))
      return {
        version: 1,
        items: [
          'device.registered',
          'device.retired',
          'policy.execution.terminal',
          'compliance.status.changed',
          'device.access.changed',
        ],
      }
    if (o.path.endsWith('/subscriptions/{id}')) return record
    const row = o.path.includes('/deliveries') ? delivery : record
    const fields = String(o.query?.['fields'] ?? '')
      .split(',')
      .filter(Boolean)
    return {
      items: [
        fields.length ? Object.fromEntries(fields.map((key) => [key, Reflect.get(row, key)])) : row,
      ],
      nextCursor: null,
    }
  })
  const w = await mountAt(WebhookSubscriptionsPanel, {
    tenant: a,
    session: session(),
    settings: { subscriptions: createWebhookSubscriptions(f.client) },
    operations: authority(['webhook_read', 'webhook_write', 'webhook_replay']),
  })
  const query = w.findAll('.directory-query')
  await query[1]!.get('select').setValue(['id'])
  await button(query[1]!, '应用查询').trigger('click')
  await flushPromises()
  await w.get('.directory-results button').trigger('click')
  await flushPromises()
  expect(f.calls.at(-1)?.path).toContain('/subscriptions/{id}')
  await query[0]!.get('select').setValue(['id'])
  await button(query[0]!, '应用查询').trigger('click')
  await flushPromises()
  await w.findAll('.directory-results')[0]!.get('button').trigger('click')
  await flushPromises()
  expect(f.calls.at(-1)?.path).toBe('/api/v1/webhooks/deliveries/{id}')
  expect(w.text()).toContain(b)
})

it('keeps webhook navigation at its accepted position when the required event contract cannot be read', async () => {
  let available = false
  const f = transport((o: RequestOptions<unknown>) => {
    if (o.path.endsWith('/event-types')) {
      if (!available) throw new Error('unavailable')
      return {
        version: 1,
        items: [
          'device.registered',
          'device.retired',
          'policy.execution.terminal',
          'compliance.status.changed',
          'device.access.changed',
        ],
      }
    }
    return { items: [{ id: a }], nextCursor: 'YQ' }
  })
  const w = await mountAt(WebhookSubscriptionsPanel, {
    tenant: a,
    session: session(),
    settings: { subscriptions: createWebhookSubscriptions(f.client) },
    operations: authority(['webhook_read', 'webhook_write', 'webhook_replay']),
  })
  const q = w.findAll('.directory-query')[1]!
  await q.get('select').setValue(['id'])
  await button(q, '应用查询').trigger('click')
  await flushPromises()
  expect(f.calls.some((o) => o.path.endsWith('/subscriptions'))).toBe(false)
  expect(button(q, '下一页').attributes('disabled')).toBeDefined()
  available = true
  await button(q, '应用查询').trigger('click')
  await flushPromises()
  expect(w.get('.directory-results').text()).toContain(a)
  expect(button(q, '下一页').attributes('disabled')).toBeUndefined()
})
