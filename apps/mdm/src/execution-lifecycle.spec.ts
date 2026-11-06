// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Runtime } from './runtime'
import type { ControlIntent, ControlRecovery } from '@rss/mdm-execution'
import type { ViewEndpoint } from '@rss/mdm-devices'
import { DeviceControl } from './DeviceControl'
import { ControlRecoveryPanel } from './ControlRecovery'
import { isUnknown } from './AdminUi'
import { decodeMdmError } from '@rss/api/mdm'
import { EnterpriseEditor } from './EnterpriseEditor'
import { Policies } from './Policies'
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
  primaryMdmRegistration: {
    registrationId: '11111111-1111-4111-8111-111111111111',
    generation: 1,
    source: 'mdm.windows',
  },
  channels: [],
  enrollments: [],
}
it('separates a formal unsupported action rejection from an unknown server response', () => {
  expect(isUnknown(decodeMdmError(501, { code: 'action_not_supported' }))).toBe(false)
  expect(isUnknown(decodeMdmError(501, {}))).toBe(true)
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
        devices: { view: async () => ({ endpoints: [endpoint] }) },
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
          grants: [{ operation: 'device_control', scope: { kind: 'all_devices' } }],
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
      h(ControlRecoveryPanel, {
        runtime,
        locale: 'zh',
        device: 'device-a',
        id: '11111111-1111-4111-8111-111111111111',
        revision: 4,
        registration: '22222222-2222-4222-8222-222222222222',
        generation: 7,
        canReauthorize: true,
        confirmationRequired: true,
        terminal: false,
        onRefresh() {},
      }),
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
        expectedRegistrationId: '22222222-2222-4222-8222-222222222222',
        expectedGeneration: 7,
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
        devices: { view: async () => ({ endpoints: [endpoint] }) },
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
          grants: [{ operation: 'device_wipe', scope: { kind: 'all_devices' } }],
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
    expectedRegistrationId: endpoint.primaryMdmRegistration!.registrationId,
    expectedGeneration: 1,
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
          authorization: {
            effective: async () => ({
              grants: [{ operation: 'enterprise_applications_write', scope: { kind: 'tenant' } }],
            }),
          },
          deviceAccess: { enterpriseDetail, changeEnterprise },
        }),
      } as unknown as Runtime
    await act(async () =>
      root.render(h(EnterpriseEditor, { runtime, locale: 'zh', id, onChanged() {} })),
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
            registrationId: 'registration',
            generation: 1,
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
            qualification: { state: 'qualified' },
            availability: 'available',
            sources: [],
            execution: {
              kind: 'periodic',
              latestRun: { taskId: run },
              currentRecord: { state: 'unknown' },
            },
          },
        ],
        nextCursor: null,
      })),
      runtime = {
        administration: () => ({
          binding: 'session-a',
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
            read: async () => ({ id: policy, definition: { action: { kind: 'script' } } }),
            runs,
            assignments,
          },
          execution: {
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
      path = `/policies?${new URLSearchParams({ policy, tab, state: 'enabled', filter: "alias=='selected'", sort: '-revision', field: 'id', limit: '50', cursor: 'directory-page-2', runCursor: 'run-page-2', assignmentCursor: 'assignment-page-2' })}`
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
    expect(document.querySelector('[role=tab][aria-selected=true]')!.textContent).toContain(
      tab === 'runs' ? '执行事实' : '设备分配',
    )
    await clickRun()
    await act(async () => host.querySelector<HTMLAnchorElement>('a[href^="/policies?"]')!.click())
    expect(host.querySelector('[data-location]')!.textContent).toBe(path)
    expect(list.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        limit: 50,
        cursor: 'directory-page-2',
        filter: "(state=='enabled');(alias=='selected')",
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
      ])
    expect(document.querySelector('[role=tab][aria-selected=true]')!.textContent).toContain(
      tab === 'runs' ? '执行事实' : '设备分配',
    )
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
