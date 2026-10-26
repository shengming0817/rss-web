import { telemetryBytes } from '../../contracts/collection/canonical'
import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { shallowRef } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { decodeMdmError } from '@rss/api/mdm'
import { networkErrorForTest } from '@rss/api/testing'
import type { IdentitySession } from '@rss/auth'
import { createScenario, TENANT } from '../../../demo/scenario'
import { createDeviceDemo } from '../../../demo/devices/state'
import { createAutomationDemo } from '../../../demo/policies/state'
import { seedTelemetry, DEMO_PROFILE } from '../../../demo/telemetry-seed'
import { ADMIN } from '../../../demo/operations/authorization'
import { mdmKey, type MdmRuntime } from '../../context'
import { mdmI18n } from '../../i18n'
import { createDeviceClients } from '../devices/client'
import { createPolicyClients } from '../policies/client'
import { createOperationsClients } from '../operations/client'
import { settingsFeature } from '../settings/routes'
import { operationsFeature } from '../operations/routes'
import { policyFeature } from '../policies/routes'
import DevicePerformance from './components/DevicePerformance.vue'
import DeviceCollections from './components/DeviceCollections.vue'
import DeviceActivity from './components/DeviceActivity.vue'
import { fieldDefinition, fieldInput } from '../devices/clients/assets'
import { bucket, numeric, health, gaps } from './model'
import { checked } from '../../contracts/collection/check'
import { validateValueMapping } from '../../contracts/collection/generated/validators'
import { telemetryProfile } from '../policies/clients/telemetry-profile'
const wrappers: VueWrapper[] = []
const cleanups: (() => void)[] = []
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  cleanups
    .splice(0)
    .reverse()
    .forEach((reset) => reset())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})
async function setup(name = 'perf', query: Record<string, string> = {}) {
  const domain = createDeviceDemo(),
    automation = createAutomationDemo(domain)
  domain.bindAuthorization(automation.authorization.can)
  seedTelemetry(automation)
  cleanups.push(() => {
    domain.reset()
    automation.reset()
  })
  const scenario = createScenario([automation.handle, domain.handle], () => {
    domain.reset()
    automation.reset()
    seedTelemetry(automation)
  })
  const login = await scenario.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const headers = {
      'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
      'x-identity-request': '1',
    },
    requests: RequestOptions<unknown>[] = []
  const transport = {
    async request<T>(options: RequestOptions<T>) {
      requests.push(options as RequestOptions<unknown>)
      const path = options.path.replace(/\{([^}]+)\}/g, (_, k: string) =>
          encodeURIComponent(options.pathParams?.[k] ?? ''),
        ),
        query = new URLSearchParams(
          Object.entries(options.query ?? {})
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)]),
        )
      const reply = await scenario.handle(options.method, path + '?' + query, options.body, headers)
      if (reply.status !== options.successStatus) throw decodeMdmError(reply.status, reply.body)
      return options.decode(reply.body)
    },
  } as HttpTransport
  const sessionState = shallowRef({
    status: 'authenticated' as const,
    tenant: TENANT,
    identity: { principalId: ADMIN },
    session: { id: 'telemetry-test' },
  })
  const runtime = {
    tenant: TENANT,
    realm: 'tenant',
    demo: true,
    session: { state: sessionState } as unknown as IdentitySession,
    transport,
    devices: createDeviceClients(transport, TENANT),
    policies: createPolicyClients(transport),
    operations: createOperationsClients(transport, TENANT),
  } as unknown as MdmRuntime
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      ...Object.entries({
        perf: DevicePerformance,
        health: DeviceCollections,
        activity: DeviceActivity,
      }).map(([name, component]) => ({
        path: '/' + name,
        name,
        component,
        props: { device: 'device-01' },
      })),
      settingsFeature.entry,
      ...settingsFeature.routes!,
      operationsFeature.entry,
      ...operationsFeature.routes!,
      policyFeature.entry,
      ...policyFeature.routes!,
    ],
  })
  await router.push({
    name,
    params: name.startsWith('settings-') || name.startsWith('policy-') ? { tenant: TENANT } : {},
    query,
  })
  await router.isReady()
  const i18n = mdmI18n()
  i18n.global.locale.value = 'zh-CN'
  const wrapper = mount(RouterView, {
    attachTo: document.body,
    global: { plugins: [router, i18n], provide: { [mdmKey as symbol]: runtime } },
  })
  wrappers.push(wrapper)
  await flushPromises()
  const body = () => new DOMWrapper(document.body)
  async function click(text: string) {
    const button = body()
      .findAll('button')
      .find((b) => b.isVisible() && b.text() === text)
    if (!button) throw new Error('Missing button ' + text)
    await button.trigger('click')
    await flushPromises()
  }
  return { runtime, wrapper, scenario, requests, router, click, body, automation, sessionState }
}
it('consumes raw readings once for chart and table and clears them after device authorization is withdrawn', async () => {
  const h = await setup()
  expect(h.wrapper.find('svg').exists()).toBe(true)
  expect(h.requests.filter((r) => r.path === '/api/v1/telemetry/history')).toHaveLength(1)
  await h.click('数据明细')
  expect(h.wrapper.findAll('tbody tr')).toHaveLength(60)
  expect(h.wrapper.findAll('path.telemetry-line')).toHaveLength(2)
  expect(h.wrapper.text()).toContain('缺失')
  expect(h.wrapper.text()).toContain('失败')
  await h.wrapper.get('input[type=range]').setValue(22)
  expect(h.wrapper.get('figcaption').text()).toContain('—')
  h.scenario.set('forbidden')
  await h.click('重新读取')
  expect(h.wrapper.find('svg').exists()).toBe(false)
  expect(h.wrapper.findAll('tbody tr')).toHaveLength(0)
})
it('uses server resolution and rate statistics, while raw counters and states remain observations', async () => {
  const h = await setup()
  await h.wrapper
    .findAll('.telemetry-metrics button')
    .find((b) => b.text().includes('network_received'))!
    .trigger('click')
  await flushPromises()
  const aggregate = h.requests.find((r) => r.path === '/api/v1/telemetry/aggregate')!
    .body as Record<string, unknown>
  expect(aggregate).toMatchObject({
    operation: 'rate',
    maxGapMicros: 300_000_000,
    coverage: { coverage: 'observedOnly' },
    source: 'agent.script',
  })
  expect(h.wrapper.text()).toContain('/s')
  await h.wrapper.get('input[type=number]').setValue(60)
  await flushPromises()
  expect(
    h.requests.filter((r) => r.path === '/api/v1/telemetry/aggregate').at(-1)!.body,
  ).toMatchObject({ maxGapMicros: 60_000_000 })
  const mode = h.wrapper.findAll('select').find((s) => s.find('option[value=total]').exists())!
  await mode.setValue('total')
  await flushPromises()
  expect(h.wrapper.text()).toContain('原始计数')
  await h.wrapper
    .findAll('.telemetry-metrics button')
    .find((b) => b.text().includes('service_state'))!
    .trigger('click')
  await flushPromises()
  expect(h.wrapper.find('svg').attributes('aria-label')).toContain('离散状态')
  expect(h.wrapper.findAll('circle')).toHaveLength(50)
  expect(h.wrapper.findAll('path.telemetry-line')).toHaveLength(0)
})
it('changes UTC horizons and granularity and preserves unavailable readings as blank buckets', async () => {
  const h = await setup()
  await h.wrapper.findAll('select')[0]!.setValue('7d')
  await flushPromises()
  const q = h.requests.filter((r) => r.path === '/api/v1/telemetry/aggregate').at(-1)!.body as {
    query: { startMicros: number; endMicros: number }
    resolutionMicros: number
  }
  expect(q.query.endMicros - q.query.startMicros).toBe(604800_000_000)
  expect(q.resolutionMicros).toBe(3600_000_000)
  await h.click('数据明细')
  expect(
    h.wrapper.findAll('tbody tr').some((r) => r.text().includes('Gaps') && r.text().includes('—')),
  ).toBe(true)
  await h.wrapper.findAll('select')[1]!.setValue('5m')
  await flushPromises()
  expect(
    (
      h.requests.filter((r) => r.path.endsWith('/aggregate')).at(-1)!.body as {
        resolutionMicros: number
      }
    ).resolutionMicros,
  ).toBe(300_000_000)
})
it('shows receipt-window health, explicit truncation and registration diagnostics independently of coverage', async () => {
  const h = await setup('health')
  expect(h.wrapper.text()).toContain('历史已投递')
  expect(h.wrapper.text()).toContain('容量丢弃')
  expect(h.wrapper.text()).toContain(DEMO_PROFILE)
  h.scenario.set('partial')
  await h.click('重新读取')
  expect(h.wrapper.text()).toContain('返回结果已截断')
  h.scenario.set('forbidden')
  await h.click('重新读取')
  expect(h.wrapper.text()).not.toContain('有效 48')
})
it('renders actual activity and queries action filters without fabricating events', async () => {
  const h = await setup('activity')
  expect(h.requests.some((r) => r.path.endsWith('/timeline'))).toBe(true)
  expect(h.wrapper.get('.telemetry-activity').text()).toContain('成功')
  expect(h.wrapper.get('.telemetry-activity').text()).not.toContain('succeeded')
  await h.wrapper.get('#audit-action').setValue('nonexistent-action')
  await h.wrapper.get('[data-testid=audit-filter]').trigger('submit')
  await flushPromises()
  expect(h.wrapper.text()).toContain('暂无记录')
})
it('publishes retention revisions and canonical custom fields through the existing CAS contract', async () => {
  const h = await setup('settings-metrics')
  await h.click('保留策略')
  let dialog = h.body().get('[role=dialog][data-state=open]')
  await dialog.findAll('input')[0]!.setValue('custom_retention')
  await h.click('保存新版本')
  expect(
    h.requests.filter((r) => r.path === '/api/v1/asset-retention-policies').at(-1)!.body,
  ).toMatchObject({ expectedRevision: 0, input: { key: 'custom_retention', revision: 1 } })
  await h.click('新建字段')
  dialog = h.body().get('[role=dialog][data-state=open]')
  await dialog.findAll('input')[0]!.setValue('custom.telemetry_new')
  const labels = dialog.findAll('label'),
    retention = labels.find((l) => l.text() === '保留策略标识')!
  await retention.get('input').setValue('custom_retention')
  await dialog.findAll('input[type=checkbox]').at(-1)!.setValue(true)
  await h.click('保存新版本')
  expect(
    h.requests.filter((r) => r.path === '/api/v1/asset-fields/{field}').at(-1)!.body,
  ).toMatchObject({
    expectedRevision: 0,
    input: {
      definition: {
        key: 'custom.telemetry_new',
        valueType: { kind: 'number' },
        sources: { 'agent.native': 0, 'agent.script': 1, 'agent.osquery': 2 },
        timeSeries: { kind: 'gauge', retention: { key: 'custom_retention', revision: 1 } },
      },
    },
  })
})
it.each([
  ['cumulative_counter', ['increase', 'rate']],
  ['delta_counter', ['sum', 'rate']],
] as const)('publishes a %s field with admitted counter operations', async (kind, aggregations) => {
  const h = await setup('settings-metrics')
  await h.click('新建字段')
  const dialog = h.body().get('[role=dialog][data-state=open]')
  await dialog.findAll('input')[0]!.setValue('custom.' + kind)
  await dialog.get('select[aria-label="指标种类"]').setValue(kind)
  await dialog
    .findAll('label')
    .find((l) => l.text() === '保留策略标识')!
    .get('input')
    .setValue('demo_standard')
  await dialog.findAll('input[type=checkbox]').at(-1)!.setValue(true)
  await h.click('保存新版本')
  expect(
    h.requests.filter((r) => r.path === '/api/v1/asset-fields/{field}').at(-1)!.body,
  ).toMatchObject({ input: { definition: { timeSeries: { kind, aggregations } } } })
  expect(h.body().find('[role=dialog][data-state=open]').exists()).toBe(false)
})
it('freezes unknown field writes, treats current state as comparison and replays exactly', async () => {
  const h = await setup('settings-metrics')
  await h.wrapper
    .findAll('button')
    .find((b) => b.text() === '配置')!
    .trigger('click')
  await flushPromises()
  let dialog = h.body().get('[role=dialog][data-state=open]')
  await dialog.findAll('input[type=checkbox]').at(-1)!.setValue(true)
  h.scenario.set('unknown')
  await h.click('保存新版本')
  const first = h.requests.find((r) => r.path === '/api/v1/asset-fields/{field}')!.body
  dialog = h.body().get('[role=dialog][data-state=open]')
  expect(dialog.get('fieldset').attributes('disabled')).toBeDefined()
  h.scenario.set('normal')
  await h.click('查询对照')
  expect(dialog.text()).toContain('上次提交结果尚未确认')
  await h.click('重放同一请求')
  expect(
    h.requests.filter((r) => r.path === '/api/v1/asset-fields/{field}').map((r) => r.body),
  ).toEqual([first, first])
})
it('keeps a bound field immutable and displays actual references before publishing a new retention binding', async () => {
  const h = await setup('settings-metrics')
  const row = h.wrapper
    .findAll('tbody tr')
    .find((r) => r.text().includes('custom.demo.cpu_busy_percent'))!
  await row.get('button').trigger('click')
  await flushPromises()
  const dialog = h.body().get('[role=dialog][data-state=open]')
  expect(dialog.text()).toContain('历史绑定不能移除')
  expect(dialog.text()).toContain('采集方案')
  expect(dialog.findAll('fieldset').some((f) => f.attributes('disabled') !== undefined)).toBe(true)
})
it.each([false, true])(
  'starts a fresh reference query on immediate reopen (same field: %s)',
  async (same) => {
    const h = await setup('settings-metrics')
    const original = h.runtime.devices.assets.fieldReferences
    let release!: (value: Awaited<ReturnType<typeof original>>) => void
    const pending = new Promise<Awaited<ReturnType<typeof original>>>((resolve) => {
      release = resolve
    })
    const read = vi
      .spyOn(h.runtime.devices.assets, 'fieldReferences')
      .mockImplementationOnce(() => pending)
    const rows = h.wrapper.findAll('tbody tr')
    await rows[0]!.get('button').trigger('click')
    await flushPromises()
    expect(read).toHaveBeenCalledTimes(1)
    const first = read.mock.calls[0]![0]
    const stale = {
      ...(await original(first)),
      mappings: [{ resource: 'stale-reference', version: '1', state: 'frozen', telemetry: false }],
    }
    await h.body().get('[role=dialog][data-state=open] button[aria-label]').trigger('click')
    await flushPromises()
    await rows[same ? 0 : 1]!.get('button').trigger('click')
    await flushPromises()
    expect(read).toHaveBeenCalledTimes(2)
    expect(read.mock.calls[1]![0] === first).toBe(same)
    expect(h.body().get('[role=dialog][data-state=open]').text()).toContain('引用影响')
    release(stale)
    await flushPromises()
    expect(h.body().get('[role=dialog][data-state=open]').text()).not.toContain('stale-reference')
  },
)
it('shows reference read failure and retries the current field explicitly', async () => {
  const h = await setup('settings-metrics')
  const read = vi
    .spyOn(h.runtime.devices.assets, 'fieldReferences')
    .mockRejectedValueOnce(networkErrorForTest())
  await h.wrapper.findAll('tbody tr')[0]!.get('button').trigger('click')
  await flushPromises()
  const dialog = h.body().get('[role=dialog][data-state=open]')
  expect(dialog.find('[role=alert]').exists()).toBe(true)
  await dialog
    .findAll('button')
    .find((button) => button.text() === '重新读取')!
    .trigger('click')
  await flushPromises()
  expect(read).toHaveBeenCalledTimes(2)
  expect(read.mock.calls[1]![0]).toBe(read.mock.calls[0]![0])
  expect(dialog.text()).toContain('引用影响')
  expect(dialog.find('[role=alert]').exists()).toBe(false)
})
it('freezes an immutable profile resource, uploads canonical bytes, previews actual targets and publishes an exact Policy', async () => {
  const h = await setup('policy-telemetry', { resource: DEMO_PROFILE })
  const dialog = h.body().get('[role=dialog][data-state=open]')
  expect(dialog.text()).toContain('custom.demo.cpu_busy_percent')
  await h.click('下一步')
  const scope = dialog
    .findAll('select')
    .find((s) => s.find('option[value="88888888-8888-4888-8888-888888888888"]').exists())!
  await scope.setValue('88888888-8888-4888-8888-888888888888')
  await h.click('下一步')
  await h.click('保存、上传并激活方案资源')
  await vi.waitFor(() => expect(dialog.text()).toContain('目标预检'))
  expect(dialog.text()).toContain('device-01')
  expect(h.requests.some((r) => r.path.endsWith('/complete'))).toBe(true)
  await dialog.findAll('input[type=checkbox]').at(-1)!.setValue(true)
  await h.click('确认发布策略变更')
  const body = h.requests
    .filter((r) => r.path === '/api/v1/policies/{id}' && r.method === 'POST')
    .at(-1)!.body
  expect(body).toMatchObject({
    expectedRevision: 0,
    input: {
      enabled: true,
      definition: {
        action: { kind: 'telemetry_profile', resource: { id: DEMO_PROFILE, variant: 'default' } },
      },
    },
  })
})
it('recovers a committed profile upload from its exact receipt without repeating the frozen version or upload', async () => {
  const h = await setup('policy-telemetry', { resource: DEMO_PROFILE })
  const dialog = h.body().get('[role=dialog][data-state=open]'),
    uploads = h.runtime.policies.resources.uploads,
    complete = uploads.complete,
    receipt = uploads.receipt,
    begin = vi.spyOn(uploads, 'begin'),
    finish = vi.spyOn(uploads, 'complete').mockImplementationOnce(async (...args) => {
      await complete(...args)
      throw networkErrorForTest()
    })
  await h.click('下一步')
  await dialog.get('select[aria-label="目标范围"]').setValue('88888888-8888-4888-8888-888888888888')
  await h.click('下一步')
  await h.click('保存、上传并激活方案资源')
  await vi.waitFor(() => expect(dialog.text()).toContain('上次提交结果尚未确认'))
  const resourceWrites = () =>
    h.requests
      .filter((r) => r.path === '/api/v1/resources/{id}' && r.method === 'POST')
      .map((r) => (r.body as { input: Record<string, unknown> }).input)
  const frozen = resourceWrites().find((input) => input['action'] === 'version')!
  expect(dialog.text()).toContain('上次提交结果尚未确认')
  expect(resourceWrites().some((input) => input['action'] === 'activate')).toBe(false)
  const read = vi.spyOn(uploads, 'receipt').mockImplementationOnce(async (...args) => {
    const confirmed = await receipt(...args)
    return { ...confirmed, sha256: confirmed.sha256.map((v, i) => (i === 0 ? v ^ 255 : v)) }
  })
  await h.click('查询对照')
  expect(dialog.text()).toContain('上次提交结果尚未确认')
  await h.click('保存、上传并激活方案资源')
  expect(resourceWrites().some((input) => input['action'] === 'activate')).toBe(false)
  expect(begin).toHaveBeenCalledTimes(1)
  expect(finish).toHaveBeenCalledTimes(1)
  await h.click('查询对照')
  expect(read.mock.calls).toEqual([
    begin.mock.calls[0]!.slice(0, 2),
    begin.mock.calls[0]!.slice(0, 2),
  ])
  expect(dialog.text()).not.toContain('上次提交结果尚未确认')
  await h.click('保存、上传并激活方案资源')
  await vi.waitFor(() => expect(dialog.text()).toContain('目标预检'))
  expect(begin).toHaveBeenCalledTimes(1)
  expect(finish).toHaveBeenCalledTimes(1)
  expect(resourceWrites().filter((input) => input['action'] === 'version')).toEqual([frozen])
  expect(resourceWrites().filter((input) => input['action'] === 'activate')).toEqual([
    { action: 'activate', version: frozen['version'] },
  ])
  await dialog.findAll('input[type=checkbox]').at(-1)!.setValue(true)
  await h.click('确认发布策略变更')
  expect(
    h.requests.filter((r) => r.path === '/api/v1/policies/{id}' && r.method === 'POST').at(-1)!
      .body,
  ).toMatchObject({
    input: {
      definition: {
        action: {
          kind: 'telemetry_profile',
          resource: { id: DEMO_PROFILE, version: frozen['version'] },
        },
      },
    },
  })
})
it('preserves nested field types and priority maps in writes, without derived presentation fields', () => {
  const field = fieldDefinition({
    key: 'custom.rows',
    version: 3,
    timeSeries: null,
    valueType: {
      kind: 'array',
      maxItems: 12,
      items: {
        kind: 'record',
        properties: {
          status: { required: true, valueType: { kind: 'enum', values: ['running', 'stopped'] } },
        },
      },
    },
    nullable: true,
    manual: false,
    sources: { 'agent.script': 17, 'agent.osquery': 4 },
    platforms: ['macos'],
    sensitivity: 'sensitive',
    unit: '1',
    searchable: false,
    itemKey: 'id',
    operations: [],
  })
  expect(fieldInput(field)).toMatchObject({
    valueType: {
      items: { properties: { status: { valueType: { values: ['running', 'stopped'] } } } },
    },
    sources: { 'agent.script': 17, 'agent.osquery': 4 },
  })
  expect(fieldInput(field)).not.toHaveProperty('kind')
  expect(fieldInput(field)).not.toHaveProperty('operations')
})
it('validates mappings from the producer schema and rejects retired shapes, unknown conversions and unsafe numbers', () => {
  const mapping = {
    pointer: '/rows',
    conversion: { kind: 'identity' },
    columns: { value: { pointer: '/percent', conversion: { kind: 'number' }, columns: {} } },
  }
  expect(checked(validateValueMapping, mapping)).toEqual(mapping)
  for (const value of [
    '/old',
    { ...mapping, conversion: { kind: 'unknown' } },
    {
      ...mapping,
      conversion: { kind: 'scale', numerator: Number.MAX_SAFE_INTEGER + 1, denominator: 1 },
    },
  ])
    expect(() => checked(validateValueMapping, value)).toThrow()
  expect(
    checked(validateValueMapping, {
      pointer: '',
      conversion: { kind: 'array_member', member: 1, present: 'yes', absent: 'no' },
      columns: {},
    }),
  ).toMatchObject({ conversion: { kind: 'array_member' } })
})
it('normalizes server sufficient statistics and discrete aggregates without deriving samples', () => {
  const b = (value: unknown) =>
    bucket({
      window: { start: 100, end: 200 },
      value,
      valid_samples: 1,
      covered_micros: 50,
      completeness: [],
    }).value
  expect(b('Missing')).toEqual({ kind: 'missing' })
  expect(b({ Number: { type: 'f64', value: -2.5 } })).toEqual({ kind: 'number', value: -2.5 })
  expect(b({ Sum: { I128: -5 } })).toEqual({ kind: 'number', value: -5 })
  expect(b({ Count: 2 })).toEqual({ kind: 'number', value: 2 })
  expect(b({ Mean: { sum: { U128: 12 }, count: 3 } })).toEqual({ kind: 'number', value: 4 })
  expect(b({ Rate: { increase: { F64: 10 }, duration_micros: 2_000_000 } })).toEqual({
    kind: 'number',
    value: 5,
  })
  expect(
    b({ StateSegments: [{ value: { Bool: true }, window: { start: 100, end: 150 } }] }),
  ).toMatchObject({ kind: 'timeline', segments: [{ value: true }] })
  expect(
    b({ Transitions: [{ at: 100, from: { State: 'stopped' }, to: { State: 'running' } }] }),
  ).toMatchObject({ kind: 'transitions' })
  expect(b({ StateCoverage: [{ value: { State: 'running' }, micros: 50 }] })).toMatchObject({
    kind: 'coverage',
  })
  expect(() => b({ Mean: { sum: { F64: 2 }, count: 0 } })).toThrow()
  expect(() => numeric({ type: 'u64', value: Number.MAX_SAFE_INTEGER + 1 })).toThrow()
  expect(() => b({ Unknown: 1 })).toThrow()
})
it('rejects malformed health and gap contracts rather than treating diagnostics as metric coverage', () => {
  expect(() =>
    health({
      batches: [],
      batchesTruncated: false,
      retention: [],
      retentionTruncated: false,
      qualityOrder: ['failed', 'missing', 'valid'],
      retired: false,
    }),
  ).toThrow()
  expect(() =>
    gaps({ reports: [], next: { receivedAt: 1, reportId: 'not-a-uuid' } }, 'device-01'),
  ).toThrow()
})
it('serializes exact Resource artifact bytes with Rust struct and map ordering', () => {
  const profile = telemetryProfile({
    template: {
      resource: 'template',
      version: 'v1',
      variant: 'default',
      platform: 'macos',
      architecture: 'aarch64',
    },
    parameters: { '10': 10, '2': 2, z: true, a: 'literal' },
    fields: [{ key: 'custom.cpu', version: 1 }],
    projection: 'both',
    sampleMillis: 5000,
    uploadMillis: 10000,
    budget: { points: 4, bytes: 65536, resources: 1, executionMillis: 1000, outputBytes: 4096 },
    boost: null,
    backfillSeconds: 3600,
  })
  const text = new TextDecoder().decode(telemetryBytes(profile))
  expect(text).toContain('"parameters":{"10":10,"2":2,"a":"literal","z":true}')
  expect(Object.keys(JSON.parse(text) as object)).toEqual([
    'template',
    'parameters',
    'fields',
    'projection',
    'sampleMillis',
    'uploadMillis',
    'budget',
    'boost',
    'backfillSeconds',
  ])
})
it('rejects cross-tenant samples, changed selections, unsafe counts and readings outside their declared metric', async () => {
  const h = await setup(),
    request = h.requests.find((r) => r.path === '/api/v1/telemetry/history')!
  const q = request.body as { field: string; startMicros: number }
  const sample = () => ({
    id: 'sample',
    sequence: 1,
    observedAt: q.startMicros + 1000,
    interval: null,
    reading: { quality: 'valid', value: { type: 'number', value: { type: 'f64', value: -2.5 } } },
    stream: {
      scope: { tenant: TENANT, namespace: 'mdm.telemetry' },
      source: '11111111-1111-4111-8111-111111111111:agent.script',
      generation: '22222222-2222-4222-8222-222222222222',
    },
    series: {
      definition: {
        scope: { tenant: TENANT, namespace: 'mdm.telemetry' },
        key: q.field,
        version: 1,
        unit: 'percent',
        metric: { kind: 'gauge', number: 'f64' },
        dimensions: {
          allowed: [],
          required: [],
          maxCount: 0,
          maxValueBytes: 256,
          maxTotalBytes: 256,
        },
      },
      subject: 'device-01',
      resource: 'device',
      dimensions: {},
    },
  })
  const decode = (s: unknown, next: unknown = null) =>
    request.decode({
      rows: [{ sample: s, receivedAt: q.startMicros + 2000, liveSource: true }],
      unavailable: [],
      next,
      retired: false,
      mode: 'history',
    })
  expect(decode(sample())).toMatchObject({ rows: [{ sample: { reading: { value: -2.5 } } }] })
  const tenant = sample()
  tenant.stream.scope.tenant = '33333333-3333-4333-8333-333333333333'
  expect(() => decode(tenant)).toThrow()
  const selection = sample()
  selection.series.subject = 'other-device'
  expect(() => decode(selection)).toThrow()
  const reading = sample()
  reading.reading.value.value = { type: 'u64', value: Number.MAX_SAFE_INTEGER + 1 }
  expect(() => decode(reading)).toThrow()
  const metric = sample()
  metric.series.definition.metric.number = 'i64'
  expect(() => decode(metric)).toThrow()
  expect(() => decode(sample(), 1)).toThrow()
})
it('binds every aggregate response to the selected resolution and intersecting ordered bucket windows', async () => {
  const h = await setup()
  await h.wrapper.findAll('select')[1]!.setValue('5m')
  await flushPromises()
  const request = h.requests.find((r) => r.path === '/api/v1/telemetry/aggregate')!,
    query = request.body as { query: { startMicros: number }; resolutionMicros: number }
  const start = query.query.startMicros,
    b = {
      window: { start, end: start + query.resolutionMicros },
      value: 'Missing',
      valid_samples: 0,
      covered_micros: 0,
      completeness: ['Gaps'],
    }
  const response = {
    buckets: [b],
    unavailable: [],
    resolutionMicros: query.resolutionMicros,
    refreshedThrough: null,
    next: null,
  }
  expect(request.decode(response)).toMatchObject({ buckets: [{ value: { kind: 'missing' } }] })
  expect(() => request.decode({ ...response, resolutionMicros: 1 })).toThrow()
  expect(() => request.decode({ ...response, buckets: [b, b] })).toThrow()
  expect(() =>
    request.decode({ ...response, buckets: [{ ...b, window: { start: 0, end: 1 } }] }),
  ).toThrow()
})
it.each(['resources', 'history', 'discovery', 'aggregate'] as const)(
  'clears all values and locators when %s continuation loses permission',
  async (kind) => {
    const h = await setup(),
      client = h.runtime.devices.telemetry,
      denied = decodeMdmError(403, { code: 'permission_denied' })
    if (kind === 'resources') {
      const resource = vi.spyOn(client, 'resources').mockResolvedValueOnce({
        resources: ['private-volume'],
        nextAfter: 'resource-page',
        retired: false,
      })
      await h.wrapper
        .findAll('.telemetry-metrics button')
        .find((b) => b.text().includes('memory_available_bytes'))!
        .trigger('click')
      await flushPromises()
      expect(h.wrapper.get('.telemetry-series').text()).toContain('private-volume')
      resource.mockRejectedValueOnce(denied)
    } else if (kind === 'aggregate') {
      const original = client.aggregate,
        aggregate = vi
          .spyOn(client, 'aggregate')
          .mockImplementationOnce(async (q) => ({ ...(await original(q)), next: 'aggregate-page' }))
      await h.wrapper.findAll('select')[1]!.setValue('5m')
      await flushPromises()
      aggregate.mockRejectedValueOnce(denied)
    } else {
      const original = client.history,
        history = vi
          .spyOn(client, 'history')
          .mockImplementationOnce(async (q) => ({ ...(await original(q)), next: 'history-page' }))
      if (kind === 'discovery') {
        await h.wrapper.findAll('select')[1]!.setValue('5m')
        await flushPromises()
      } else await h.click('重新读取')
      history.mockRejectedValueOnce(denied)
    }
    expect(h.wrapper.find('svg').exists()).toBe(true)
    await h.click('数据明细')
    const previous = h.requests.filter((r) => r.path === '/api/v1/telemetry/history').at(-1)!
      .body as {
      device: string
      field: string
      startMicros: number
      endMicros: number
      resource: string
    }
    await h.click(kind === 'discovery' ? '继续发现来源与生命周期' : '下一页')
    if (kind === 'resources')
      expect(client.resources).toHaveBeenLastCalledWith(
        'device-01',
        previous.field,
        'resource-page',
      )
    else if (kind === 'aggregate')
      expect(client.aggregate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({ ...previous, after: 'aggregate-page' }),
        }),
      )
    else
      expect(client.history).toHaveBeenLastCalledWith(
        expect.objectContaining({ ...previous, after: 'history-page' }),
      )
    expect(h.wrapper.find('svg').exists()).toBe(false)
    expect(h.wrapper.findAll('tbody tr')).toHaveLength(0)
    expect(h.wrapper.findAll('.telemetry-series select option')).toHaveLength(0)
    expect(h.wrapper.findAll('button').some((b) => b.text() === '下一页')).toBe(false)
  },
)
it('discards health and diagnostics after a saved diagnostic continuation is rejected', async () => {
  const h = await setup('health'),
    client = h.runtime.devices.telemetry,
    original = client.gaps,
    cursor = { receivedAt: Date.now() * 1000 - 1000, reportId: crypto.randomUUID() }
  const gaps = vi
    .spyOn(client, 'gaps')
    .mockImplementationOnce(async (...args) => ({ ...(await original(...args)), next: cursor }))
  await h.click('重新读取')
  expect(h.wrapper.text()).toContain('有效 48')
  gaps.mockRejectedValueOnce(decodeMdmError(403, { code: 'permission_denied' }))
  await h.click('下一页')
  expect(gaps.mock.calls.at(-1)?.[3]).toEqual(cursor)
  expect(h.wrapper.text()).not.toContain('有效 48')
  expect(h.wrapper.text()).not.toContain('容量丢弃')
  expect(h.wrapper.findAll('.telemetry-log')).toHaveLength(0)
})
it('preserves the original boost expiration and the newly chosen scope when updating an existing Policy', async () => {
  const h = await setup('policy-telemetry'),
    rc = h.runtime.policies.resources,
    read = rc.read,
    expiresAt = Math.floor(Date.now() / 1000) + 3617,
    newScope = crypto.randomUUID()
  vi.spyOn(rc, 'read').mockImplementation(async (id) => {
    const resource = await read(id)
    if (id === DEMO_PROFILE)
      for (const version of resource.versions)
        for (const variant of version.variants)
          if (variant.declaration.kind === 'telemetry_profile')
            variant.declaration.definition.boost = { sampleMillis: 30000, expiresAt }
    return resource
  })
  const existing = await h.runtime.policies.policies.read('99999999-9999-4999-8999-999999999999')
  await h.runtime.policies.policies.change(existing.id, {
    operationId: crypto.randomUUID(),
    expectedRevision: existing.revision,
    input: {
      action: 'put',
      enabled: existing.enabled,
      definition: { ...existing.definition, customEvent: 'refresh.telemetry' },
    },
  })
  const body = {
      operationId: crypto.randomUUID(),
      expectedRevision: 0,
      input: {
        action: 'put' as const,
        definition: {
          targets: [{ kind: 'device' as const, id: 'device-02' }],
          limitations: null,
          exclusions: [],
        },
      },
    },
    task = await h.runtime.policies.scopes.change(newScope, body)
  for (let i = 0; i < 3; i++) await h.runtime.policies.scopes.status(newScope, task.task!)
  await h.click('配置')
  await h.click('下一步')
  let dialog = h.body().get('[role=dialog][data-state=open]')
  const scope = dialog
    .findAll('select')
    .find((s) => s.find(`option[value="${newScope}"]`).exists())!
  await scope.setValue(newScope)
  await h.click('下一步')
  dialog = h.body().get('[role=dialog][data-state=open]')
  await dialog
    .findAll('select')
    .find((s) => s.find('option[value="99999999-9999-4999-8999-999999999999"]').exists())!
    .setValue('99999999-9999-4999-8999-999999999999')
  await flushPromises()
  await h.click('保存、上传并激活方案资源')
  await vi.waitFor(() =>
    expect(h.requests.some((request) => request.path === '/api/v1/policies/previews')).toBe(true),
  )
  const version = h.requests
    .filter(
      (r) =>
        r.path === '/api/v1/resources/{id}' &&
        r.method === 'POST' &&
        (r.body as { input: { action: string } }).input.action === 'version',
    )
    .at(-1)!.body
  expect(version).toMatchObject({
    input: {
      variants: [{ declaration: { definition: { boost: { sampleMillis: 30000, expiresAt } } } }],
    },
  })
  expect(
    h.requests.filter((r) => r.path === '/api/v1/policies/previews').at(-1)!.body,
  ).toMatchObject({ definition: { scope: newScope } })
  await dialog.findAll('input[type=checkbox]').at(-1)!.setValue(true)
  await h.click('确认发布策略变更')
  expect(
    h.requests.filter((r) => r.path === '/api/v1/policies/{id}' && r.method === 'POST').at(-1)!
      .body,
  ).toMatchObject({
    expectedRevision: 2,
    input: { definition: { scope: newScope, customEvent: 'refresh.telemetry' } },
  })
})
it('does not publish a profile prepared under a session that changes during artifact hashing', async () => {
  const h = await setup('policy-telemetry', { resource: DEMO_PROFILE })
  await h.click('下一步')
  const dialog = h.body().get('[role=dialog][data-state=open]')
  await dialog
    .findAll('select')
    .find((s) => s.find('option[value="88888888-8888-4888-8888-888888888888"]').exists())!
    .setValue('88888888-8888-4888-8888-888888888888')
  await h.click('下一步')
  let release!: (value: ArrayBuffer) => void
  const digest = new Promise<ArrayBuffer>((resolve) => (release = resolve))
  vi.spyOn(crypto.subtle, 'digest').mockReturnValueOnce(digest)
  await h.click('保存、上传并激活方案资源')
  h.sessionState.value = { ...h.sessionState.value, session: { id: 'changed-session' } }
  await flushPromises()
  release(new ArrayBuffer(32))
  await flushPromises()
  expect(
    h.requests.filter((r) => r.path === '/api/v1/resources/{id}' && r.method === 'POST'),
  ).toHaveLength(0)
  expect(h.body().text()).not.toContain('核对采集变更')
})
