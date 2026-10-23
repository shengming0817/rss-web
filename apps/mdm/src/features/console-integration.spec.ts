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
