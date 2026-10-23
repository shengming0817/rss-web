import { decodeRunEvidence } from './policies/clients/runs'
import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, shallowRef } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
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
  binding: { device: 'mac', registration: b, generation: 2, subject: { kind: 'filevault' } },
  version: 3,
  current: true,
  validity: 'unknown',
  escrowed: true,
  operation: c,
  createdAt: 4,
  invalidatedAt: null,
}
it('binds credential versions to the device and accepts escrow without claiming verified validity', async () => {
  const f = transport([entry]),
    client = createCredentialsClient(f.client)
  const page = await client.list('mac', material(entry, 'mac'))
  expect(page[0]).toMatchObject({ escrowed: true, validity: 'unknown', version: 3 })
  expect(f.calls[0]?.query).toEqual({ afterId: a, afterVersion: 3 })
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
it('decodes lifecycle preview and retained assignments without loosening ordinary assignment channels', async () => {
  const action = {
      kind: 'unmanage_device' as const,
      schedule: defaultSchedule(),
      runLifetimeSeconds: 3600,
    },
    definition = { scope: a, action }
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
  const f = transport((o: RequestOptions<unknown>) =>
    o.path.endsWith('previews')
      ? { action, scopeResult: a, items: [row], nextCursor: null }
      : { items: [{ ...row, eligibility: undefined }], nextCursor: null },
  )
  expect((await createPoliciesClient(f.client).preview(definition)).items[0]?.channel).toBeNull()
  const retained = Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'eligibility'))
  const normal = transport({ items: [retained], nextCursor: null })
  expect(
    (await createPoliciesClient(normal.client).assignments(a, undefined, true)).items[0]
      ?.scopeResult,
  ).toBeNull()
  await expect(createPoliciesClient(normal.client).assignments(a)).rejects.toThrow()
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
  await client.list('opaque', undefined, undefined, {
    state: 'archived',
    scope: b,
    category: 'retirement',
  })
  expect(f.calls[0]?.query).toMatchObject({
    cursor: 'opaque',
    state: 'archived',
    scope: b,
    category: 'retirement',
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
  expect(f.calls[1]?.headers).toBeUndefined()
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
      security: { credentials: { list: async () => [material(entry, 'mac')], reveal } },
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

function button(w: VueWrapper, label: string) {
  return w.findAll('button').find((b) => b.text() === label)!
}
async function confirm(w: VueWrapper) {
  await w.findAll('input[type="checkbox"]').at(-1)!.setValue(true)
}
async function seedUnknown(runtime: object, key: string, input: unknown) {
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
      throw new Error('lost response')
    },
    () => {},
  )
  const id = op.pending.value!.id
  w.unmount()
  return id
}
it('revokes an exact Windows credential through the shared confirmation without cloning a Vue proxy', async () => {
  const revoke = vi.fn(async () => ({ ...entry, validity: 'revoked' }))
  const w = await mountAt(
    CredentialsPanel,
    {
      tenant: a,
      session: session(),
      security: { credentials: { list: async () => [material(entry, 'mac')], revoke } },
    },
    { endpoint: { id: 'mac', channels: [], primaryMdmRegistration: null } },
  )
  await button(w, '读取').trigger('click')
  await flushPromises()
  expect(button(w, '撤销托管读取').attributes('disabled')).toBeDefined()
  await confirm(w)
  await button(w, '撤销托管读取').trigger('click')
  await flushPromises()
  expect(revoke).toHaveBeenCalledWith('mac', material(entry, 'mac'))
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
    const originalId = await seedUnknown(runtime, 'api-access', input)
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
    const originalId = await seedUnknown(runtime, 'lifecycle-policy', input)
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
    .mockResolvedValueOnce({})
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
  expect(w.find('select').attributes('disabled')).toBeDefined()
  await button(w, '冲突：重新读取并比较后编辑').trigger('click')
  await flushPromises()
  expect(detail).toHaveBeenCalledWith({ kind: 'endpoint', id: 'mac' })
  expect(w.text()).toContain('active')
  expect(w.find('select').attributes('disabled')).toBeUndefined()
  await w.find('select').setValue('active')
  await confirm(w)
  await button(w, '保存').trigger('click')
  await flushPromises()
  expect(asset.mock.calls[1]?.[2]).toBe('active')
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
    expected: { Configurations: [] },
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
  const container =
    w.findAll('label').find((l) => l.text() === label) ??
    w.findAll('label').find((l) => l.text().startsWith(label))!
  return container.find('input, textarea, select')
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
    status: 'dead_letter',
    transportObservation: 'rejected',
    failureStage: 'transport',
    failureReason: 'gone',
  }
  const f = transport((o: RequestOptions<unknown>) => {
    if (o.path.endsWith('/event-types')) return { version: 1, items: ['device.retired'] }
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
    return o.path.endsWith('/subscriptions') ? { items: [record] } : record
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
  await field(w, '设备范围').setValue('groups')
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
  await button(w, '启用整个 Policy').trigger('click')
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
    if (o.path.endsWith('/api-keys')) return { items: [key], nextCursor: null }
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
  await button(w, '撤销托管读取').trigger('click')
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
  await w.find('select').setValue('credential')
  await flushPromises()
  await field(w, '策略 ID').setValue(a)
  await field(w, '设备范围 ID').setValue(a)
  await w
    .findAll('select')
    .find((s) => s.find('option[value="rotate_bitlocker"]').exists())!
    .setValue('rotate_bitlocker')
  await field(w, '处理器架构').setValue('aarch64')
  await field(w, '卷 DeviceID').setValue('volume')
  await field(w, '保护器 ID').setValue(b)
  await field(w, '账户 SID').setValue('S-1-5-21')
  await button(w, '预览').trigger('click')
  await flushPromises()
  expect(preview).toHaveBeenCalledWith(
    expect.objectContaining({
      action: expect.objectContaining({
        operation: { kind: 'rotate_bitlocker', volume: 'volume', protector: b },
        architecture: 'aarch64',
      }),
    }),
    undefined,
    undefined,
  )
  await confirm(w)
  await w.find('form').trigger('submit')
  await flushPromises()
  expect(change.mock.calls[0]?.[1]).toMatchObject({
    expectedRevision: 0,
    input: { enabled: false },
  })
  await confirm(w)
  await button(w, '启用整个 Policy').trigger('click')
  await flushPromises()
  await field(w, '原操作期限').setValue('5000')
  await confirm(w)
  await button(w, '显式触发').trigger('click')
  await flushPromises()
  expect(rerun).toHaveBeenCalledWith(a, expect.any(String), expect.any(Number), 5000)
  expect(assignments).toHaveBeenCalledWith(a, undefined, false)
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
