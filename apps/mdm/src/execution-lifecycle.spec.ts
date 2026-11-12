import { newPolicyAction } from './PolicyActionEditor'
// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { act, createElement as h, Fragment } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Runtime } from './runtime'
import type { ControlIntent, ControlRecovery } from '@rss/mdm-execution'
import type { EndpointDetail, ViewEndpoint } from '@rss/mdm-devices'
import { DeviceDetail } from './DeviceDetail'
import { DeviceControl } from './DeviceControl'
import { OperationDiagnostics } from './OperationDiagnostics'
import { DeviceRetirement } from './DeviceRetirement'
import { ControlRecoveryPanel } from './ControlRecovery'
import { isUnknown } from './AdminUi'
import { decodeMdmError } from '@rss/api/mdm'
import { EnterpriseEditor } from './EnterpriseEditor'
import { BindingEditor } from './BindingEditor'
import { Policies } from './Policies'
import { resultReturnPath } from './execution-context'
import { Executions, policyReturnPath } from './Executions'
import type { EnterpriseConfiguration } from '@rss/mdm-device-access'
vi.mock('./useOperationAuthorization', () => ({
  useOperationAuthorization: () => ({
    status: 'authorized',
    authorized: true,
    consume() {},
    cancel: async () => {},
    delivery: { capture: () => 0, isCurrent: () => true },
  }),
}))
let host: HTMLDivElement, root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const computedStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => computedStyle(element))
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function button(text: string) {
  const value = [...document.querySelectorAll('button')].find(
    (node) => node.textContent === text && !node.closest('[hidden]'),
  )
  if (!value) throw new Error('Missing button ' + text)
  return value
}
const endpoint: ViewEndpoint = {
  id: 'device-a',
  status: 'active',
  assetState: 'active',
  platform: { state: 'known', values: ['windows'] },
  channel: 'mdm' as const,
  source: 'mdm.windows',
  registeredAt: null,
  lastCommunicationReceivedAt: null,
  enrollment: null,
}
function detailSnapshot(target = endpoint, allowed = ['restart']): EndpointDetail {
  return {
    ...target,
    platform: target.platform.state === 'known' ? (target.platform.values[0] ?? null) : null,
    capabilities: ['restart', 'lock', 'wipe'].map((action) => ({
      action,
      channel: 'mdm' as const,
      productSupport: { state: 'supported', reason: null },
      devicePrerequisite: { state: 'supported', reason: null },
      permission: {
        allowed: allowed.includes(action),
        reason: allowed.includes(action) ? null : 'permission_denied',
      },
    })),
  }
}
it('separates a formal unsupported action rejection from an unknown server response', () => {
  expect(isUnknown(decodeMdmError(501, { code: 'action_not_supported' }))).toBe(false)
  expect(isUnknown(decodeMdmError(501, {}))).toBe(true)
  expect(isUnknown(decodeMdmError(202, {}))).toBe(true)
  expect(isUnknown(decodeMdmError(503, { code: 'service_unavailable' }))).toBe(true)
})
it('retains the original write as unknown across hiding and a late public receipt instead of enabling another UUID', async () => {
  let resolve!: (value: { operationId: string; revision: number }) => void
  const deferred = new Promise<{ operationId: string; revision: number }>((yes) => {
      resolve = yes
    }),
    create = vi.fn((_input: ControlIntent) => deferred),
    runtime = {
      administration: () => ({
        devices: { endpoint: async () => detailSnapshot() },
        execution: { create },
      }),
    } as unknown as Runtime
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(DeviceControl, {
          runtime,
          locale: 'zh',
          endpoint,
          snapshot: detailSnapshot(),
          canReadOriginal: true,
          onReload: vi.fn(),
          onStale: vi.fn(),
        }),
      ),
    ),
  )
  await act(async () => button('核对设备与动作').click())
  const label = [...document.querySelectorAll('label')].find((node) =>
      node.textContent?.includes('我已核对设备、动作与影响'),
    )!,
    checkbox = label.querySelector<HTMLInputElement>('input')!
  await act(async () => checkbox.click())
  await act(async () => button('确认提交此动作').click())
  expect(create).toHaveBeenCalledOnce()
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await act(async () => resolve({ operationId: create.mock.calls[0]![0].operationId, revision: 1 }))
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(button('核对设备与动作').disabled).toBe(true)
  expect(host.textContent).toContain('提交结果未知')
  expect(create).toHaveBeenCalledOnce()
})
it('allows a wipe-only principal to confirm backend-authorized recovery without a separate restart grant', async () => {
  const reauthorize = vi.fn(
      async (_device: string, operationId: string, _input: ControlRecovery) => ({
        operationId,
        revision: 5,
      }),
    ),
    runtime = {
      administration: () => ({
        binding: 'session-a',
        authorization: {
          effective: async () => ({
            grants: [{ operation: 'device_wipe', scope: { kind: 'all_devices' } }],
          }),
        },
        execution: { reauthorize },
      }),
    } as unknown as Runtime
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(ControlRecoveryPanel, {
          runtime,
          locale: 'zh',
          device: 'device-a',
          id: '11111111-1111-4111-8111-111111111111',
          revision: 4,

          canReauthorize: true,
          confirmationRequired: true,
          terminal: false,
          onRefresh() {},
        }),
      ),
    ),
  )
  await act(async () => document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
  expect(button('重新授权原操作').disabled).toBe(false)
  expect(button('请求取消原操作').disabled).toBe(true)
  await act(async () => button('重新授权原操作').click())
  expect(reauthorize).toHaveBeenCalledOnce()
  expect(reauthorize.mock.calls[0]).toEqual([
    'device-a',
    '11111111-1111-4111-8111-111111111111',
    expect.objectContaining({
      expectedRevision: 4,
      confirmation: {
        confirmed: true,
      },
    }),
  ])
})
it('allows a wipe-only principal to select, review and explicitly submit a wipe', async () => {
  const create = vi.fn(async (input: ControlIntent) => ({
      operationId: input.operationId,
      revision: 1,
    })),
    runtime = {
      administration: () => ({
        devices: { endpoint: async () => detailSnapshot(endpoint, ['wipe']) },
        execution: { create },
      }),
    } as unknown as Runtime
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(DeviceControl, {
          runtime,
          locale: 'zh',
          endpoint,
          snapshot: detailSnapshot(endpoint, ['wipe']),
          canReadOriginal: true,
          onReload: vi.fn(),
          onStale: vi.fn(),
        }),
      ),
    ),
  )
  expect(button('核对设备与动作').disabled).toBe(true)
  await act(async () =>
    document
      .querySelector('[role=combobox]')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
  )
  const wipe = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(
    (node) => node.textContent === '擦除设备',
  )!
  expect(wipe).toBeDefined()
  await act(async () => wipe.click())
  expect(button('核对设备与动作').disabled).toBe(false)
  await act(async () => button('核对设备与动作').click())
  expect(host.textContent).toContain('擦除可能永久删除')
  await act(async () => document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
  await act(async () => button('确认提交此动作').click())
  expect(create).toHaveBeenCalledOnce()
  expect(create.mock.calls[0]![0].action).toEqual({
    kind: 'wipe',
    confirmed: true,
  })
})
it.each<EnterpriseConfiguration>([
  {
    kind: 'relying_party',
    id: 'client',
    callback: 'https://example.test/callback',
    capabilities: ['native_key'],
    enabled: true,
  },
  {
    kind: 'subject',
    provider: '11111111-1111-4111-8111-111111111111',
    person: {
      instance: '22222222-2222-4222-8222-222222222222',
      principal: '33333333-3333-4333-8333-333333333333',
    },
    subject: 'original-subject',
    username: 'original-user',
    enabled: true,
  },
])(
  'shows server values separately from frozen $kind input after an unknown submission',
  async (configuration) => {
    const observed =
        configuration.kind === 'relying_party'
          ? {
              ...configuration,
              callback: 'https://current.test/changed',
              capabilities: ['password'] as const,
              enabled: false,
            }
          : {
              ...configuration,
              person: { ...configuration.person, instance: '44444444-4444-4444-8444-444444444444' },
              subject: 'current-subject',
              username: 'current-user',
              enabled: false,
            },
      id =
        configuration.kind === 'relying_party'
          ? 'rp:client'
          : `subject:${configuration.provider}:${configuration.person.principal}`,
      enterpriseDetail = vi
        .fn()
        .mockResolvedValueOnce({ id, revision: 1, configuration })
        .mockResolvedValue({ id, revision: 3, configuration: observed }),
      changeEnterprise = vi.fn(async () => {
        throw { cause: 'transport' }
      }),
      runtime = {
        host: { serviceId: '22222222-2222-4222-8222-222222222222' },
        administration: () => ({
          binding: 'session-a',
          devices: { views: async () => ({ items: [], nextCursor: null }) },
          authorization: {
            effective: async () => ({
              grants: [{ operation: 'enterprise_applications_write', scope: { kind: 'tenant' } }],
            }),
          },
          deviceAccess: { enterpriseDetail, changeEnterprise },
        }),
      } as unknown as Runtime
    await act(async () =>
      root.render(
        h(MemoryRouter, null, h(EnterpriseEditor, { runtime, locale: 'zh', id, onChanged() {} })),
      ),
    )
    await act(async () => button('冻结并核对企业配置').click())
    await act(async () => document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
    await act(async () => button('确认保存企业配置').click())
    expect(changeEnterprise).toHaveBeenCalledOnce()
    await act(async () => button('刷新当前配置以核对').click())
    const current = host.querySelector('section[aria-label="服务端当前配置"]')!
    expect(current.textContent).toContain('3')
    expect(current.textContent).toContain('否')
    if (configuration.kind === 'relying_party') {
      expect(current.textContent).toContain('https://current.test/changed')
      expect(current.textContent).toContain('密码')
      expect(host.querySelector<HTMLInputElement>('input[id$="callback"]')!.value).toBe(
        configuration.callback,
      )
    } else {
      for (const value of [
        'current-subject',
        'current-user',
        '44444444-4444-4444-8444-444444444444',
        configuration.provider,
        configuration.person.principal,
      ])
        expect(current.textContent).toContain(value)
      expect(host.querySelector<HTMLInputElement>('input[id$="subject"]')!.value).toBe(
        configuration.subject,
      )
    }
    expect(host.textContent).toContain('不证明原操作完成')
    expect(button('确认保存企业配置').disabled).toBe(true)
    expect(changeEnterprise).toHaveBeenCalledOnce()
  },
)
function NavigationProbe() {
  const location = useLocation(),
    navigate = useNavigate()
  return h(
    'div',
    null,
    h('output', { 'data-location': true }, location.pathname + location.search),
    h('button', { onClick: () => navigate(-1) }, '浏览器返回'),
  )
}
it.each(['runs', 'assignments'])(
  'restores policy filters, cursors and the %s tab through both return routes',
  async (tab) => {
    const policy = '11111111-1111-4111-8111-111111111111',
      run = '22222222-2222-4222-8222-222222222222',
      list = vi.fn(async (_query: unknown) => ({ items: [], nextCursor: null })),
      runs = vi.fn(async () => ({
        items: [
          {
            taskId: run,
            device: 'device-a',
            occurrence: 'event',
            availableAt: 1,
            deadline: 2,
          },
        ],
        nextCursor: null,
      })),
      assignments = vi.fn(async () => ({
        items: [
          {
            object: { kind: 'endpoint', id: 'device-a' },
            qualification: { state: 'eligible' },
            availability: 'ready',
            sources: [],
            execution: {
              kind: 'recurring',
              latestRun: { taskId: run, state: { execution: 'succeeded' } },
              currentRecord: { state: 'unknown' },
            },
          },
        ],
        nextCursor: null,
      })),
      runtime = {
        administration: () => ({
          binding: 'session-a',
          devices: { views: async () => ({ items: [], nextCursor: null }) },
          authorization: {
            effective: async () => ({
              grants: ['policy_read', 'operation_read', 'inventory_read'].map((operation) => ({
                operation,
                scope: { kind: 'tenant' },
              })),
            }),
          },
          policies: {
            list,
            read: async () => ({
              id: policy,
              revision: 1,
              version: 1,
              versionId: run,
              state: 'enabled',
              scopes: [],
              definition: {
                scope: { targets: [], limitations: null, exclusions: [] },
                alias: null,
                customEvent: null,
                action: newPolicyAction('execution'),
              },
            }),
            runs,
            assignments,
          },
          execution: {
            summary: async () => ({
              id: run,
              device: 'device-a',
              policy,
              status: 'unknown',
            }),
            list: async () => ({ items: [], nextCursor: null }),
            statistics: async () => ({ total: 0, commands: 0, actionRuns: 0, unknown: 0, asOf: 1 }),
            detail: async () => ({
              policy,
              item: null,
              detail: { id: run, device: 'device-a', delivery: 'pending', owner: 'task' },
            }),
          },
        }),
      } as unknown as Runtime,
      path = `/policies?${new URLSearchParams({ policy, tab: 'records', record: tab, state: 'enabled', filter: "alias=='selected'", sort: '-revision', field: 'id', limit: '50', cursor: 'directory-page-2', runCursor: 'run-page-2', assignmentCursor: 'assignment-page-2' })}`
    await act(async () =>
      root.render(
        h(
          MemoryRouter,
          { initialEntries: [path] },
          h(NavigationProbe),
          h(
            Routes,
            null,
            h(Route, { path: '/policies', element: h(Policies, { runtime, locale: 'zh' }) }),
            h(Route, { path: '/operations', element: h(Executions, { runtime, locale: 'zh' }) }),
          ),
        ),
      ),
    )
    const clickRun = async () => {
      await act(async () =>
        host.querySelector<HTMLAnchorElement>('a[href^="/operations?"]')!.click(),
      )
    }
    await clickRun()
    expect(host.textContent).toContain('原操作与结果')
    await act(async () => button('浏览器返回').click())
    expect(host.querySelector('[data-location]')!.textContent).toBe(path)
    expect(
      [...document.querySelectorAll('[role=tab][aria-selected=true]')]
        .map((node) => node.textContent)
        .join(' '),
    ).toContain(tab === 'runs' ? '执行事实' : '设备分配')
    await clickRun()
    await act(async () => host.querySelector<HTMLAnchorElement>('a[href^="/policies?"]')!.click())
    expect(host.querySelector('[data-location]')!.textContent).toBe(path)
    expect(list.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        limit: 50,
        cursor: 'directory-page-2',
        filter: "(alias=='selected')",
        sort: ['-revision'],
        fields: ['id'],
      }),
    )
    if (tab === 'runs')
      expect(runs.mock.lastCall).toEqual([
        policy,
        { limit: 20, cursor: 'run-page-2' },
        expect.any(AbortSignal),
      ])
    else
      expect(assignments.mock.lastCall).toEqual([
        policy,
        { limit: 20, cursor: 'assignment-page-2' },
        expect.any(AbortSignal),
      ])
    expect(
      [...document.querySelectorAll('[role=tab][aria-selected=true]')]
        .map((node) => node.textContent)
        .join(' '),
    ).toContain(tab === 'runs' ? '执行事实' : '设备分配')
  },
)
it('never applies a policy return locator to another policy or an external host', () => {
  for (const value of [
    'https://evil.test/policies?policy=a',
    '//evil.test/policies?policy=a',
    '/policies?policy=b',
    '/policies/other?policy=a',
  ])
    expect(policyReturnPath('a', value)).toBe('/policies?policy=a')
})

it.each(['binding', 'enterprise'])(
  'retries the failed %s permission read without issuing a write',
  async (kind) => {
    const effective = vi
      .fn()
      .mockRejectedValueOnce(decodeMdmError(503, { code: 'unavailable' }))
      .mockResolvedValue({ grants: [] })
    const runtime = {
      host: { serviceId: '22222222-2222-4222-8222-222222222222' },
      administration: () => ({
        binding: 'permission-retry',
        authorization: { effective },
        deviceAccess: {},
      }),
    } as unknown as Runtime
    await act(async () =>
      root.render(
        kind === 'binding'
          ? h(BindingEditor, {
              runtime,
              locale: 'zh',
              device: 'device',
              id: '11111111-1111-4111-8111-111111111111',
              isNew: true,
              onChanged() {},
            })
          : h(EnterpriseEditor, { runtime, locale: 'zh', id: null, onChanged() {} }),
      ),
    )
    expect(effective).toHaveBeenCalledTimes(1)
    await act(async () => button('重新读取').click())
    expect(effective).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[role=alert]')).toBeNull()
  },
)

it('binds labels to their own controls when binding and enterprise editors share the page', async () => {
  const runtime = {
    host: { serviceId: '22222222-2222-4222-8222-222222222222' },
    administration: () => ({
      binding: 'both-editors',
      deviceAccess: {},
      authorization: {
        effective: async () => ({
          grants: [
            { operation: 'account_write', scope: { kind: 'all_devices' } },
            { operation: 'enterprise_applications_write', scope: { kind: 'tenant' } },
          ],
        }),
      },
    }),
  } as unknown as Runtime
  await act(async () =>
    root.render(
      h(
        Fragment,
        null,
        h(BindingEditor, {
          runtime,
          locale: 'zh',
          device: 'device',
          id: '11111111-1111-4111-8111-111111111111',
          isNew: true,
          onChanged() {},
        }),
        h(EnterpriseEditor, { runtime, locale: 'zh', id: null, onChanged() {} }),
      ),
    ),
  )
  const labels = [...host.querySelectorAll('label')].filter((node) =>
    ['绑定动作', '配置类型'].includes(node.textContent ?? ''),
  )
  expect(labels).toHaveLength(2)
  const controls = labels.map((label) => document.getElementById(label.htmlFor))
  expect(controls.every(Boolean)).toBe(true)
  expect(controls[0]).not.toBe(controls[1])
  await act(async () => controls[1]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
  const option = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(
    (node) => node.textContent === '账户主体映射',
  )
  expect(option).toBeDefined()
  await act(async () => option!.click())
  expect(
    [...host.querySelectorAll('label')].some((label) => label.textContent === 'Provider UUID'),
  ).toBe(true)
})

it('loads sensitive evidence explicitly and keeps the authorized summary when detail is denied', async () => {
  const id = '11111111-1111-4111-8111-111111111111',
    summary = vi.fn(async () => ({
      id,
      kind: 'command',
      device: 'device-a',
      policy: null,
      status: 'applied',
    })),
    detail = vi.fn(async () => {
      throw decodeMdmError(403, { code: 'permission_denied' })
    }),
    create = vi.fn(),
    runtime = {
      administration: () => ({
        binding: 'sensitive',
        authorization: { effective: async () => ({ grants: [] }) },
        execution: {
          summary,
          detail,
          create,
          list: async () => ({ items: [], nextCursor: null }),
          statistics: async () => ({ total: 0, commands: 0, actionRuns: 0, unknown: 0, asOf: 1 }),
          trust: async () => ({ revision: 1, keys: [] }),
        },
      }),
    } as unknown as Runtime
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        { initialEntries: [`/operations?kind=command&operation=${id}`] },
        h(Executions, { runtime, locale: 'zh' }),
      ),
    ),
  )
  expect(host.textContent).toContain('目录状态')
  expect(host.textContent).toContain('device-a')
  expect(detail).not.toHaveBeenCalled()
  await act(async () => button('读取详细结果与证据').click())
  expect(detail).toHaveBeenCalledOnce()
  expect(host.textContent).toContain('当前账户没有此操作权限')
  expect(host.textContent).toContain('目录状态')
  expect(create).not.toHaveBeenCalled()
})

it('shows historical success beside an absent current run and performs one bounded name lookup per page', async () => {
  const { PolicyAssignments } = await import('./PolicyProgress'),
    id = '11111111-1111-4111-8111-111111111111',
    views = vi.fn(async () => ({
      items: [
        {
          key: 'endpoint:device-a',
          endpoints: [
            {
              id: 'device-a',
              displayName: { kind: 'known', value: { kind: 'string', value: 'Lobby Mac' } },
            },
          ],
        },
      ],
      nextCursor: null,
    })),
    assignments = vi.fn(async () => ({
      items: [
        {
          object: { kind: 'endpoint', id: 'device-a' },
          channel: 'agent',
          qualification: { state: 'eligible' },
          availability: 'ready',
          reason: null,
          target: null,
          sources: [],
          scopeResult: null,
          taskAdmission: { state: 'waiting_check_in', nextAllowedStartAt: null },
          execution: {
            kind: 'recurring',
            latestRun: { taskId: id, state: { execution: 'succeeded' } },
            currentRecord: { state: 'absent' },
          },
        },
      ],
      nextCursor: null,
    })),
    admin = { policies: { assignments }, devices: { views } } as unknown as ReturnType<
      Runtime['administration']
    >,
    policy = {
      id,
      versionId: id,
      definition: { action: { kind: 'execution' } },
    } as unknown as Parameters<typeof PolicyAssignments>[0]['policy']
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(PolicyAssignments, {
          policies: admin.policies,
          devices: admin.devices,
          policy,
          locale: 'zh',
        }),
      ),
    ),
  )
  expect(host.textContent).toContain('Lobby Mac')
  expect(host.textContent).toContain('成功')
  expect(host.textContent).toContain('已核对，尚无运行')
  expect(host.textContent).toContain('未知 / 等待事件')
  expect(views).toHaveBeenCalledOnce()
  expect(views.mock.calls[0]).toEqual([
    { fields: ['key', 'reference', 'endpoints'], limit: 1, filter: "key=='endpoint:device-a'" },
    expect.any(AbortSignal),
  ])
  expect(assignments.mock.calls[0]).toEqual([id, { limit: 20 }, expect.any(AbortSignal)])
  await act(async () => button('读取分配').click())
  expect(assignments).toHaveBeenCalledTimes(2)
})

it('accepts only public result return coordinates for the exact device page', () => {
  expect(
    resultReturnPath('/devices/endpoint/a?tab=history&endpoint=a', '/devices/endpoint/a'),
  ).toBe('/devices/endpoint/a?tab=history&endpoint=a')
  for (const value of [
    '//evil.test/devices/endpoint/a',
    '/devices/endpoint/b?tab=history',
    '/devices/endpoint/a?secret=value',
    '/devices/endpoint/a#secret',
    '/devices/endpoint/a\\evil',
  ])
    expect(resultReturnPath(value, '/devices/endpoint/a')).toBeNull()
})

it('rejects malformed source locators without crashing a result page', () => {
  for (const value of [
    '/\\[',
    '/\\evil',
    '/devices/endpoint/a?secret=value',
    '//evil.test/policies',
    '/policies#fragment',
  ])
    expect(resultReturnPath(value)).toBeNull()
})

it.each([false, true])(
  'renders original attempt evidence only if the coordinates match (%s mismatch)',
  async (mismatch) => {
    const id = '11111111-1111-4111-8111-111111111111',
      policy = '22222222-2222-4222-8222-222222222222',
      another = '33333333-3333-4333-8333-333333333333',
      attempt = '44444444-4444-4444-8444-444444444444',
      path = `/operations?kind=action_run&operation=${id}&policy=${policy}&attempt=${mismatch ? policy : attempt}&version=${policy}&filter=device%3D%3D%27device-a%27&cursor=page-two`,
      detail = vi.fn(async () => ({
        item: null,
        policy,
        detail: {
          kind: 'run',
          owner: 'software',
          id,
          device: 'device-a',
          versionId: policy,
          occurrence: null,
          availableAt: 1,
          deadline: 2,
          state: { execution: 'succeeded', cancellation: 'none', startedAt: 1 },
          delivery: 'received',
          effect: 'unknown',
          authorization: null,
          result: null,
          attempt,
          nodes: [{ stepId: 'install-original', definition: { id: 'package', version: 'v1' } }],
          userAction: null,
        },
      })),
      runtime = {
        host: { serviceId: another },
        tenant: policy,
        administration: () => ({
          binding: 'nodes',
          devices: {
            endpoint: async () => ({
              id: 'device-a',
              channel: 'agent',
              status: 'active',
              source: 'agent.builtin',
            }),
          },
          authorization: { effective: async () => ({ grants: [] }) },
          execution: {
            summary: async () => ({
              id,
              device: 'device-a',
              policy,
              status: 'succeeded',
            }),
            detail,
            list: async () => ({
              items: [
                {
                  id: another,
                  kind: 'action_run',
                  device: 'device-a',
                  policy,
                  status: 'succeeded',
                },
              ],
              nextCursor: null,
            }),
            statistics: async () => ({ total: 0, commands: 0, actionRuns: 0, unknown: 0, asOf: 1 }),
          },
        }),
      } as unknown as Runtime
    await act(async () =>
      root.render(
        h(MemoryRouter, { initialEntries: [path] }, h(Executions, { runtime, locale: 'zh' })),
      ),
    )
    const link = host.querySelector<HTMLAnchorElement>('a[href^="/devices/endpoint/device-a"]')!
    expect(new URL(link.href).searchParams.get('returnTo')).toBe(path)
    expect(detail).not.toHaveBeenCalled()
    await act(async () => button('读取详细结果与证据').click())
    if (mismatch) {
      expect(host.textContent).toContain('原尝试详情不可用')
      expect(host.textContent).not.toContain('install-original')
      expect(host.textContent).not.toContain('显示 Agent 查看入口')
      await act(async () => button(another).click())
      await act(async () => button('读取详细结果与证据').click())
      expect(detail).toHaveBeenLastCalledWith(
        { kind: 'action_run', id: another, policy },
        expect.any(AbortSignal),
      )
      expect(host.textContent).not.toContain('原尝试详情不可用')
      expect(host.textContent).toContain('install-original')
      return
    }
    expect(host.textContent).toContain('原尝试的冻结节点')
    expect(host.textContent).toContain('install-original')
    expect(host.textContent).toContain('v1')
    await act(async () => button('显示 Agent 查看入口').click())
    expect(button('复制链接 · 步骤 install-original')).toBeDefined()
    let copied = ''
    class TestClipboardItem {
      constructor(readonly data: Record<string, Promise<Blob>>) {}
    }
    vi.stubGlobal('ClipboardItem', TestClipboardItem)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        async write([item]: [TestClipboardItem]) {
          const value = await item.data['text/plain']!
          copied = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = reject
            reader.readAsText(value)
          })
        },
      },
    })
    try {
      await act(async () => {
        button('复制命令 · 步骤 install-original').click()
        await vi.waitFor(() => expect(copied).toMatch(/^rssmdm open '/))
      })
      const uri = new URL(copied.slice("rssmdm open '".length, -1))
      expect(uri.pathname).toBe(`/v1/task/${id}`)
      expect(uri.searchParams.get('attempt')).toBe(attempt)

      expect(uri.searchParams.get('step')).toBe('install-original')
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard')
    }
  },
)

it('keeps a retirement read-only without every grant, and never treats a failed preflight as a write', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const forceRetirement = vi.fn()
  const effective = vi.fn(async () => {
    throw decodeMdmError(503, { code: 'service_unavailable' })
  })
  const runtime = {
    administration: () => ({
      binding: 'retirement',
      authorization: { effective },
      devices: {
        retirement: async () => ({
          target: {
            object: { kind: 'endpoint', id: 'device-a' },
            members: [{ device: 'device-a' }, { device: 'device-b' }],
          },
          createdAt: 20,
          forcedAt: null,
          channels: [
            {
              device: 'device-a',
              channel: 'mdm' as const,

              stage: 'queued',
            },
            {
              device: 'device-b',
              channel: 'agent',

              stage: 'queued',
            },
          ],
        }),
        forceRetirement,
      },
    }),
  } as unknown as Runtime
  const mount = (scope: { kind: 'all_devices' } | { kind: 'device'; id: string }) =>
    act(async () =>
      root.render(
        h(
          MemoryRouter,
          { initialEntries: [`/devices/endpoint/device-a?tab=retirement&retirement=${id}`] },
          h(DeviceRetirement, {
            runtime,
            locale: 'zh',
            reference: { kind: 'endpoint', id: 'device-a' },
            grants: [
              { operation: 'inventory_read', scope: { kind: 'all_devices' } },
              { operation: 'device_unmanage', scope },
            ],
          }),
        ),
      ),
    )
  await mount({ kind: 'device', id: 'device-a' })
  expect(host.textContent).toContain('device-b')
  expect(host.textContent).not.toContain('请求强制撤销')
  await mount({ kind: 'all_devices' })
  const reason = host.querySelector<HTMLTextAreaElement>('textarea')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      reason,
      'retire',
    )
    reason.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
  expect(button('请求强制撤销').disabled).toBe(false)
  await act(async () => button('请求强制撤销').click())
  expect(effective).toHaveBeenCalledOnce()
  expect(forceRetirement).not.toHaveBeenCalled()
  expect(host.textContent).not.toContain('显式重提原撤销请求')
  expect(host.querySelector<HTMLInputElement>('input[aria-label="退管标识"]')!.disabled).toBe(false)
})

it('retains an unknown recovery request while refreshing the containing result detail', async () => {
  const id = '11111111-1111-4111-8111-111111111111',
    item = {
      id,
      kind: 'command',
      device: 'device-a',
      policy: null,
      origin: 'direct',
      status: 'queued',
    },
    cancel = vi.fn(async () => {
      throw decodeMdmError(503, { code: 'service_unavailable' })
    }),
    detail = vi.fn(async () => ({
      item,
      policy: null,
      detail: {
        kind: 'command',
        owner: 'device',
        id,
        device: 'device-a',
        revision: 1,
        delivery: 'queued',
        authorization: { state: 'authorized' },
        observation: { protocol: 'syncml', effect: 'waiting' },
        target: { kind: 'device' },
        task: { name: 'Restart', kind: 'command', platform: 'windows', objects: [] },
        inputVersion: '1',
        deadline: 2,
        reauthorization: null,
      },
    })),
    runtime = {
      administration: () => ({
        binding: 'recovery-owner',
        authorization: {
          effective: async () => ({
            grants: [{ operation: 'operation_cancel', scope: { kind: 'all_devices' } }],
          }),
        },
        execution: {
          summary: async () => item,
          detail,
          cancel,
          list: async () => ({ items: [], nextCursor: null }),
          statistics: async () => ({ total: 0, commands: 0, actionRuns: 0, unknown: 0, asOf: 1 }),
        },
      }),
    } as unknown as Runtime
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        { initialEntries: [`/operations?kind=command&operation=${id}`] },
        h(Executions, { runtime, locale: 'zh' }),
      ),
    ),
  )
  await act(async () => button('读取详细结果与证据').click())
  const confirmation = [...host.querySelectorAll('label')]
    .find((node) => node.textContent?.includes('我已核对原操作及设备'))!
    .querySelector<HTMLInputElement>('input')!
  await act(async () => confirmation.click())
  await act(async () => button('请求取消原操作').click())
  expect(cancel).toHaveBeenCalledOnce()
  const original = cancel.mock.calls[0]
  await act(async () => button('查询原操作当前事实').click())
  expect(detail).toHaveBeenCalledTimes(2)
  await act(async () => button('显式重提同一恢复请求').click())
  expect(cancel.mock.calls[1]).toEqual(original)
})

it.each(['//[', '//%'])(
  'keeps execution detail mounted with malformed return locator %s',
  async (returnTo) => {
    const id = '11111111-1111-4111-8111-111111111111',
      runtime = {
        administration: () => ({
          binding: 'malformed',
          authorization: { effective: async () => ({ grants: [] }) },
          execution: {
            summary: async () => ({
              id,
              device: 'device-a',
              policy: id,
              status: 'queued',
            }),
            list: async () => ({ items: [], nextCursor: null }),
            statistics: async () => ({ total: 0, commands: 0, actionRuns: 0, unknown: 0, asOf: 1 }),
          },
        }),
      } as unknown as Runtime
    expect(resultReturnPath(returnTo, '/policies')).toBeNull()
    await act(async () =>
      root.render(
        h(
          MemoryRouter,
          {
            initialEntries: [
              `/operations?${new URLSearchParams({ kind: 'command', operation: id, returnTo })}`,
            ],
          },
          h(Executions, { runtime, locale: 'zh' }),
        ),
      ),
    )
    expect(host.textContent).toContain('device-a')
    expect(host.textContent).toContain('原操作与结果')
  },
)

it('keeps the default endpoint location during a delayed control preflight', async () => {
  const view = { association: null, endpoints: [endpoint], fields: {} }
  let release!: (value: EndpointDetail) => void
  const preflight = new Promise<EndpointDetail>((resolve) => {
    release = resolve
  })
  const detail = detailSnapshot()
  const read = vi.fn().mockResolvedValueOnce(detail).mockReturnValueOnce(preflight)
  const create = vi.fn()
  const runtime = {
    administration: () => ({
      binding: 'default-endpoint',
      authorization: {
        effective: async () => ({
          grants: [{ operation: 'device_control', scope: { kind: 'all_devices' } }],
        }),
      },
      devices: {
        view: async () => view,
        endpoint: read,
      },
      execution: { create },
      connections: { agent: {} },
    }),
  } as unknown as Runtime
  function Location() {
    const location = useLocation()
    return h('output', { 'data-location': true }, location.key + location.search)
  }
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        { initialEntries: [`/devices/endpoint/${endpoint.id}`] },
        h(Location),
        h(
          Routes,
          null,
          h(Route, {
            path: '/devices/:kind/:id',
            element: h(DeviceDetail, { runtime, locale: 'zh' }),
          }),
        ),
      ),
    ),
  )
  const location = () => host.querySelector('[data-location]')!.textContent
  const before = location()
  await act(async () => button('核对设备与动作').click())
  expect(read).toHaveBeenCalledOnce()
  const dialog = document.querySelector('[role=dialog]')!
  await act(async () => dialog.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
  await act(async () => button('确认提交此动作').click())
  expect(read).toHaveBeenLastCalledWith(endpoint.id)
  expect(location()).toBe(before)
  await act(async () =>
    release({
      ...detail,
      channel: null,
      source: null,
      registeredAt: null,
      lastCommunicationReceivedAt: null,
      enrollment: null,
      platform: null,
    }),
  )
  expect(create).not.toHaveBeenCalled()
  expect(host.textContent).toContain('设备动作尚未提交')
  expect(button('核对设备与动作').disabled).toBe(true)
  expect(location()).toBe(before)
})

it('uses URL endpoint selection for back and forward while retaining an unknown operation target', async () => {
  const association = '33333333-3333-4333-8333-333333333333',
    endpoints = [
      { ...endpoint, id: 'device-a' },
      { ...endpoint, id: 'device-b' },
    ],
    create = vi.fn(async (_input: ControlIntent) => {
      throw decodeMdmError(503, { code: 'service_unavailable' })
    }),
    runtime = {
      administration: () => ({
        binding: 'association',
        authorization: {
          effective: async () => ({
            grants: [{ operation: 'device_control', scope: { kind: 'all_devices' } }],
          }),
        },
        devices: {
          view: async () => ({ association: null, endpoints, fields: {} }),
          endpoint: async (id: string) => detailSnapshot(endpoints.find((e) => e.id === id)!),
        },
        execution: { create },
        connections: { agent: {} },
      }),
    } as unknown as Runtime,
    path = `/devices/association/${association}`
  function History() {
    const navigate = useNavigate(),
      location = useLocation()
    return h(
      Fragment,
      null,
      h('output', { 'data-location': true }, location.pathname + location.search),
      h('button', { onClick: () => navigate(-1) }, '后退终端'),
      h('button', { onClick: () => navigate(1) }, '前进终端'),
      h('button', { onClick: () => navigate(path + '?endpoint=device-a') }, '定位另一个终端'),
    )
  }
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        {
          initialEntries: [path + '?endpoint=device-a', path + '?endpoint=device-b'],
          initialIndex: 1,
        },
        h(History),
        h(
          Routes,
          null,
          h(Route, {
            path: '/devices/:kind/:id',
            element: h(DeviceDetail, { runtime, locale: 'zh' }),
          }),
        ),
      ),
    ),
  )
  const current = () => host.querySelector('.device-endpoint-select')?.textContent
  expect(current()).toContain('device-b')
  await act(async () => button('后退终端').click())
  expect(current()).toContain('device-a')
  await act(async () => button('前进终端').click())
  expect(current()).toContain('device-b')
  await act(async () => button('核对设备与动作').click())
  const dialog = document.querySelector('[role=dialog]')!
  await act(async () => dialog.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
  await act(async () => button('确认提交此动作').click())
  expect(create.mock.calls[0]![0].device).toBe('device-b')
  await act(async () => button('定位另一个终端').click())
  expect(current()).toContain('device-b')
  expect(host.querySelector('[data-location]')!.textContent).toContain('endpoint=device-b')
  expect(create).toHaveBeenCalledOnce()
})

it('opens the exact linked event batch and member read-only until the user verifies a target', async () => {
  const { PolicyEvents } = await import('./PolicyEvents'),
    id = '11111111-1111-4111-8111-111111111111',
    member = '22222222-2222-4222-8222-222222222222',
    operation = '33333333-3333-4333-8333-333333333333',
    batch = vi.fn(async () => ({
      id,
      event: 'shared.event',
      operationId: operation,
      members: 1,
      admission: { accepted: 1 },
      request: { source: { kind: 'human' } },
      deadline: 2,
      processingFailure: null,
    })),
    members = vi.fn(async () => ({
      items: [
        {
          id: member,
          policyId: id,
          versionId: id,
          revision: 1,
          state: 'accepted',
          decision: { state: 'accepted' },
          operations: [{ reference: { kind: 'native', id: operation }, state: 'queued' }],
        },
      ],
      nextCursor: null,
    })),
    submit = vi.fn(),
    admin = {
      binding: 'event-link',
      devices: { endpoints: async () => ({ items: [], nextCursor: null }) },
      policyEvents: {
        batch,
        members,
        submit,
        batches: async () => ({ items: [], nextCursor: null }),
      },
    } as unknown as ReturnType<Runtime['administration']>,
    runtime = { administration: () => admin } as Runtime
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        {
          initialEntries: [
            `/policies?tab=events&eventDevice=device-a&batch=${id}&member=${member}`,
          ],
        },
        h(PolicyEvents, {
          runtime,
          events: admin.policyEvents,
          devices: admin.devices,
          event: null,
          locale: 'zh',
          canSubmit: true,
        }),
      ),
    ),
  )
  expect(batch.mock.calls[0]).toEqual(['device-a', id, expect.any(AbortSignal)])
  expect(members.mock.calls[0]).toEqual([
    'device-a',
    id,
    { limit: 1, filter: `id=='${member}'` },
    expect.any(AbortSignal),
  ])
  expect(host.querySelector(`a[href*="operation=${operation}"]`)?.textContent).toContain(operation)
  expect(button('提交设备事件').matches(':disabled')).toBe(true)
  expect(submit).not.toHaveBeenCalled()
})

it('aborts evidence on a context switch and ignores a late receipt from the former context', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  let resolve!: (value: unknown) => void
  const pending = new Promise((done) => {
    resolve = done
  })
  const mdmOperation = vi.fn(() => pending)
  const daRequest = vi.fn(async () => ({
    items: [],
    nextCursor: null,
    coverage: { complete: false },
  }))
  const runtime = {
    management: false,
    administration: () => ({
      binding: 'diagnostics-session',
      operationDiagnostics: { mdm: { operation: mdmOperation }, da: { request: daRequest } },
    }),
  } as unknown as Runtime
  function Navigate() {
    const navigate = useNavigate()
    return h(
      'button',
      {
        onClick: () => navigate('/operation-diagnostics?context=da&mode=request&requestId=' + id),
      },
      'DA request',
    )
  }
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        {
          initialEntries: [
            '/operation-diagnostics?mode=operation&owner=resource&operationId=' + id,
          ],
        },
        h(Navigate),
        h(OperationDiagnostics, { runtime, locale: 'zh' }),
      ),
    ),
  )
  expect(mdmOperation.mock.calls).toHaveLength(1)
  const signal = (mdmOperation.mock.calls[0] as unknown[])[2] as AbortSignal
  await act(async () => button('DA request').click())
  expect(signal.aborted).toBe(true)
  expect(daRequest).toHaveBeenCalledOnce()
  await act(async () =>
    resolve({ originalResult: { availability: 'available', value: { object: 'stale-result' } } }),
  )
  expect(host.textContent).not.toContain('stale-result')
  expect(host.textContent).toContain('索引覆盖不完整')
})

it('clears a confirmed lock PIN on permission loss and again when issuing the write', async () => {
  const target: ViewEndpoint = {
    ...endpoint,
    channel: 'mdm' as const,
    source: 'mdm.apple',
    registeredAt: null,
    lastCommunicationReceivedAt: null,
    enrollment: null,
    platform: { state: 'known', values: ['macos'] },
  }
  const permitted = detailSnapshot(target, ['lock'])
  const create = vi.fn(async (input: ControlIntent, _pin?: string) => ({
    operationId: input.operationId,
    revision: 1,
  }))
  const runtime = {
    administration: () => ({ devices: { endpoint: async () => permitted }, execution: { create } }),
  } as unknown as Runtime
  async function show(snapshot: EndpointDetail) {
    await act(async () =>
      root.render(
        h(
          MemoryRouter,
          null,
          h(DeviceControl, {
            runtime,
            locale: 'zh',
            endpoint: target,
            snapshot,
            canReadOriginal: false,
            onReload() {},
            onStale() {},
          }),
        ),
      ),
    )
  }
  async function fill(value: string) {
    const input = document.querySelector<HTMLInputElement>('input[aria-label="六位锁定 PIN"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  await show(permitted)
  await act(async () =>
    document
      .querySelector('[role=combobox]')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
  )
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')]
      .find((node) => node.textContent === '锁定')!
      .click(),
  )
  await act(async () => button('核对设备与动作').click())
  await act(async () => document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
  await fill('12345')
  expect(button('确认提交此动作').disabled).toBe(true)
  await fill('123456')
  expect(button('确认提交此动作').disabled).toBe(false)
  await show(detailSnapshot(target, []))
  expect(button('核对设备与动作').disabled).toBe(true)
  await show(permitted)
  await act(async () => button('核对设备与动作').click())
  expect(document.querySelector<HTMLInputElement>('input[aria-label="六位锁定 PIN"]')!.value).toBe(
    '',
  )
  await act(async () => document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
  await fill('987654')
  await act(async () => button('确认提交此动作').click())
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ action: expect.objectContaining({ kind: 'lock' }) }),
    '987654',
  )
  expect(
    document.querySelector<HTMLInputElement>('input[aria-label="六位锁定 PIN"]')?.value ?? '',
  ).toBe('')
  expect(host.textContent).toContain(create.mock.calls[0]![0].operationId)
  expect(host.querySelector('a[href*="owner=device_control"]')).toBeNull()
})

it('keeps the original device command locked when an accepted response cannot be decoded', async () => {
  const snapshot = detailSnapshot()
  const create = vi.fn(async (_intent: ControlIntent) => {
    throw decodeMdmError(202, {})
  })
  const runtime = {
    administration: () => ({
      devices: { endpoint: async () => snapshot },
      execution: { create },
    }),
  } as unknown as Runtime
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(DeviceControl, {
          runtime,
          locale: 'zh',
          endpoint,
          snapshot,
          canReadOriginal: true,
          onReload() {},
          onStale() {},
        }),
      ),
    ),
  )
  await act(async () => button('核对设备与动作').click())
  await act(async () => document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
  await act(async () => button('确认提交此动作').click())
  expect(create).toHaveBeenCalledOnce()
  expect(button('核对设备与动作').disabled).toBe(true)
  const original = create.mock.calls[0]![0].operationId
  expect(host.querySelector(`a[href*="operationId=${original}"]`)).not.toBeNull()
  expect(host.textContent).toContain('提交结果未知')
})
