import { createFeatureRouter as createRouter } from '../../../../tests/feature-router'
import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { shallowRef, type Component } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { decodeMdmError, type HttpTransport, type RequestOptions } from '@rss/api/mdm'
import { mdmKey, type MdmRuntime } from '../../../context'
import { mdmI18n } from '../../../i18n'
import { createAuditClient } from '../clients/audit'
import { createRuntimeDiagnostics } from '../../settings/clients/runtime'
import AuditView from './AuditView.vue'
import DiagnosticsView from './DiagnosticsView.vue'
const id = '11111111-1111-4111-8111-111111111111',
  command = '22222222-2222-4222-8222-222222222222'
const fact = {
  source: 'mdm.business',
  eventId: 'safe-event',
  position: 17,
  recordedAt: 1760000000,
  observedAt: 1760000001,
  actorKind: 'user',
  actor: 'operator',
  action: 'command_cancel',
  target: { type: 'device', id: 'device-01' },
  deviceId: 'device-01',
  operationId: id,
  relatedOperationIds: [command],
  requestId: null,
  registrationId: null,
  registrationRequestId: null,
  instanceId: null,
  auditOutcome: 'succeeded',
  phase: 'request',
  executionState: null,
  effect: 'unverified',
  requestWriteOutcome: null,
  supported: true,
}
const page = {
  items: [fact],
  nextCursor: 'frozen',
  coverage: { complete: false },
}
const wrappers: VueWrapper[] = []
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
})
async function fixture(
  component: Component,
  reply: (o: RequestOptions<unknown>) => unknown | Promise<unknown>,
) {
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(await reply(o)))
  const transport = { request } as unknown as HttpTransport
  const state = shallowRef({
    status: 'authenticated',
    tenant: 'tenant',
    identity: { principalId: 'operator' },
    session: { id: 'session-1' },
  })
  const runtime = {
    tenant: 'tenant',
    session: { state },
    operations: { audit: createAuditClient(transport) },
    settings: { runtime: createRuntimeDiagnostics(transport) },
  } as unknown as MdmRuntime
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component },
      { path: '/devices/:device', name: 'device-detail', component: { template: '<div />' } },
      {
        path: '/devices/:device/history/:history',
        name: 'device-history',
        component: { template: '<div />' },
      },
      {
        path: '/executions/:execution',
        name: 'policy-execution',
        component: { template: '<div />' },
      },
    ],
  })
  await router.push('/')
  const wrapper = mount(component, {
    attachTo: document.body,
    global: { plugins: [router, mdmI18n()], provide: { [mdmKey as symbol]: runtime } },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, request, state, router, body: () => new DOMWrapper(document.body) }
}
it('keeps pagination bound to applied filters and opens only the returned safe row with verified command links', async () => {
  const f = await fixture(AuditView, () => page)
  expect(f.wrapper.text()).toContain('2025-10-09')
  expect(f.wrapper.get('tbody').text()).toContain('成功')
  expect(f.wrapper.get('tbody').text()).not.toContain('succeeded')
  await f.wrapper.get('#audit-actor').setValue('draft-actor')
  await f.wrapper
    .findAll('button')
    .find((b) => b.text() === '下一页')!
    .trigger('click')
  await flushPromises()
  expect(f.request.mock.lastCall![0].query).toEqual({ cursor: 'frozen', limit: 20 })
  await f.wrapper.findAll('tbody button')[0]!.trigger('click')
  await flushPromises()
  const detail = f.body().get('[data-testid=audit-detail]')
  expect(detail.text()).toContain('unverified')
  expect(detail.text()).toContain('成功')
  expect(detail.text()).not.toContain('succeeded')
  expect(detail.findAll('a').map((a) => a.attributes('href'))).toContain(
    `/executions/${command}?device=device-01`,
  )
  expect(
    detail
      .findAll('a')
      .map((a) => a.attributes('href'))
      .some((h) => h?.includes(`/executions/${id}`)),
  ).toBe(false)
  expect(
    f.request.mock.calls.every(([r]) => r.path === '/api/v1/audit-events' && r.method === 'GET'),
  ).toBe(true)
})
it('clears rows and drawer on permission failure and explicitly restarts expired queries', async () => {
  let status = 200
  const f = await fixture(AuditView, () => {
    if (status !== 200)
      throw decodeMdmError(status, {
        code: status === 403 ? 'permission_denied' : 'operation_conflict',
      })
    return page
  })
  await f.wrapper.findAll('tbody button')[0]!.trigger('click')
  await flushPromises()
  status = 409
  await f.wrapper
    .findAll('button')
    .find((b) => b.text() === '下一页')!
    .trigger('click')
  await flushPromises()
  expect(f.wrapper.find('tbody').exists()).toBe(false)
  expect(f.wrapper.find('[data-testid=channel-facts]').exists()).toBe(false)
  expect(f.body().find('[data-testid=audit-detail]').exists()).toBe(false)
  status = 403
  await f.wrapper.get('[data-testid=audit-filter]').trigger('submit')
  await flushPromises()
  expect(f.request.mock.lastCall![0].query).toEqual({ limit: 20 })
  expect(f.wrapper.text()).toContain('请求被拒绝')
  expect(f.wrapper.text()).not.toContain('safe-event')
})
it('discards a late audit response after a session change', async () => {
  let resolve: ((v: unknown) => void) | undefined
  let calls = 0
  const f = await fixture(AuditView, () =>
    ++calls === 1
      ? new Promise((r) => {
          resolve = r
        })
      : { ...page, items: [], nextCursor: null },
  )
  f.state.value = { ...f.state.value, session: { id: 'session-2' } }
  await flushPromises()
  resolve!(page)
  await flushPromises()
  expect(f.request).toHaveBeenCalledTimes(2)
  expect(f.wrapper.text()).not.toContain('operator')
  expect(f.wrapper.text()).not.toContain('2025-10-09')
})
it('renders diagnostic uncertainty and independent health, then clears the snapshot after a denied refresh', async () => {
  let denied = false
  const f = await fixture(DiagnosticsView, () => {
    if (denied) throw decodeMdmError(403, { code: 'permission_denied' })
    return {
      alive: true,
      channels: [
        {
          name: 'apple',
          state: 'degraded',
          reasons: ['material_version_mismatch'],
          mounted: false,
          loadedMaterials: { apns: 4 },
        },
      ],
      ready: true,
      components: [
        {
          name: 'inventory',
          readiness: 'ready',
          health: 'unknown',
          reasons: ['unobserved'],
          queues: [{ name: 'delivery_pending', count: null, truncated: null }],
          progress: {
            state: 'unobserved',
            confirmedPosition: null,
            sourceHead: null,
            lagging: null,
            invocationAgeMs: null,
            completedPassAgeMs: null,
            sourceObservationAgeMs: null,
            applied: null,
          },
        },
      ],
    }
  })
  expect(f.wrapper.text()).toContain('未知')
  expect(f.wrapper.get('[data-testid=channel-facts]').text()).toContain('所选与加载版本不一致')
  expect(f.wrapper.get('[data-testid=channel-facts]').text()).toContain('apns · 4')
  expect(f.wrapper.findAll('tbody tr')).toHaveLength(1)
  await f.wrapper.findAll('tbody button')[0]!.trigger('click')
  await flushPromises()
  expect(f.body().get('[data-testid=diagnostic-detail]').text()).toContain('未观察')
  expect(f.body().get('[data-testid=diagnostic-detail]').text()).toContain('来源水位')
  denied = true
  await f.wrapper
    .findAll('button')
    .find((b) => b.text() === '重新读取')!
    .trigger('click')
  await flushPromises()
  expect(f.wrapper.find('tbody').exists()).toBe(false)
  expect(f.wrapper.find('[data-testid=channel-facts]').exists()).toBe(false)
  expect(f.body().find('[data-testid=diagnostic-detail]').exists()).toBe(false)
  expect(
    f.request.mock.calls.every(
      ([r]) => r.method === 'GET' && r.path === '/api/v1/runtime/diagnostics',
    ),
  ).toBe(true)
})

it('retains unfamiliar safe audit outcome metadata without inventing a translated state', async () => {
  const f = await fixture(AuditView, () => ({
    ...page,
    items: [{ ...fact, auditOutcome: 'provider_pending' }],
  }))
  expect(f.wrapper.get('tbody').text()).toContain('provider_pending')
  await f.wrapper.findAll('tbody button')[0]!.trigger('click')
  await flushPromises()
  expect(f.body().get('[data-testid=audit-detail]').text()).toContain('provider_pending')
})

it('shows current diagnostics and clears the snapshot when permission is revoked', async () => {
  let denied = false
  const f = await fixture(DiagnosticsView, () => {
    if (denied) throw decodeMdmError(403, { code: 'permission_denied' })
    return {
      alive: true,
      ready: true,
      channels: [],
      components: [
        { name: 'inventory', readiness: 'ready', health: 'unknown', reasons: ['unobserved'] },
      ],
    }
  })
  await f.wrapper.findAll('tbody button')[0]!.trigger('click')
  await flushPromises()
  expect(f.body().get('[data-testid=diagnostic-detail]').text()).toContain('未观察到')
  denied = true
  await f.wrapper
    .findAll('button')
    .find((b) => b.text() === '重新读取')!
    .trigger('click')
  await flushPromises()
  expect(f.wrapper.find('tbody').exists()).toBe(false)
  expect(f.body().find('[data-testid=diagnostic-detail]').exists()).toBe(false)
})
it('discards a late runtime snapshot after the session changes', async () => {
  let resolve!: (value: unknown) => void
  let calls = 0
  const f = await fixture(DiagnosticsView, () =>
    ++calls === 1
      ? new Promise((r) => {
          resolve = r
        })
      : {
          alive: true,
          ready: true,
          channels: [],
          components: [],
        },
  )
  f.state.value = { ...f.state.value, session: { id: 'session-2' } }
  await flushPromises()
  resolve({
    alive: true,
    ready: false,
    channels: [],
    components: [
      {
        name: 'inventory',
        readiness: 'not_ready',
        health: 'degraded',
        reasons: ['dependency_unavailable'],
      },
    ],
  })
  await flushPromises()
  expect(f.wrapper.findAll('tbody button')).toHaveLength(0)
  expect(f.wrapper.get('tbody').text()).not.toContain('普通审计容量已满')
  expect(f.request).toHaveBeenCalledTimes(2)
})

it('keeps a caught-up empty audit query eventually consistent and refreshes only audit reads', async () => {
  let arrived = false
  const f = await fixture(AuditView, () =>
    arrived
      ? page
      : {
          items: [],
          nextCursor: null,
          coverage: { complete: true },
        },
  )
  expect(f.wrapper.get('[data-testid=audit-coverage]').text()).toContain('当前检查无可见未索引事实')
  expect(f.wrapper.text()).toContain('不保证跨页快照')
  expect(f.wrapper.text()).toContain('空结果不证明操作未发生')
  arrived = true
  await f.wrapper.get('[data-testid=audit-filter]').trigger('submit')
  await flushPromises()
  expect(f.wrapper.get('tbody').text()).toContain('operator')
  expect(f.request).toHaveBeenCalledTimes(2)
  expect(
    f.request.mock.calls.every(([r]) => r.method === 'GET' && r.path === '/api/v1/audit-events'),
  ).toBe(true)
})
