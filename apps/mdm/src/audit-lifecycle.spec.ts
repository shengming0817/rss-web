// @vitest-environment jsdom
import { act, createElement as h, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type {
  ActivityDetail,
  ActivityPage,
  Audit,
  AuditFact,
  AuditPage,
  AuditPolicyLookup,
} from '@rss/mdm-audit'
import { AuditWorkspace } from './Audit'
import { AuditFactView } from './AuditFacts'
import type { Runtime } from './runtime'

let host: HTMLDivElement, root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
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
function page(action: string, cursor: string | null = null): AuditPage {
  const fact: AuditFact = {
    source: 'request',
    eventId: action,
    position: 1,
    recordedAt: 20,
    observedAt: 10,
    actorKind: 'human',
    actor: 'principal',
    action,
    target: { type: 'device', id: 'device' },
    deviceId: 'device',
    operationId: null,
    relatedOperationIds: [],
    requestId: null,
    registrationId: null,
    registrationRequestId: null,
    instanceId: null,
    auditOutcome: 'succeeded',
    phase: 'recorded',
    executionState: null,
    effect: 'unknown',
    requestWriteOutcome: null,
    supported: true,
  }
  return { items: [fact], nextCursor: cursor, coverage: { complete: false } }
}
const detail: ActivityDetail = {
  activity: {
    id: 'native:fact',
    source: 'native',
    kind: 'execution',
    phase: 'received',
    recordedAt: 20,
    observedAt: 10,
    origin: 'human',
    target: {
      device: 'paired-device',
      registration: '11111111-1111-4111-8111-111111111111',
      generation: 1,
    },
    links: {
      policy: null,
      version: null,
      batch: null,
      member: null,
      request: null,
      operation: null,
      retirement: null,
      task: null,
      attempt: null,
      steps: [],
      operations: [],
    },
    delivery: 'received',
    execution: 'received',
    effect: 'unverifiable',
    reporting: null,
    decision: null,
    auditOutcome: 'succeeded',
  },
  personal: false,
  related: [],
  relatedCursor: 'YWJj',
  missing: ['not_retained'],
  asOf: 21,
}
const activities: ActivityPage = {
  items: [detail.activity],
  nextCursor: null,
  syncCursor: 'YWJj',
  asOf: 21,
  retainedFrom: null,
  coverage: [{ source: 'native', complete: false, reasons: ['not_retained'] }],
}
function runtime(
  audit: Partial<Audit>,
  grants: readonly unknown[] = [{ operation: 'audit_read', scope: { kind: 'tenant' } }],
): Runtime {
  return {
    administration: () => ({
      binding: 'tenant/principal/session',
      audit: audit as Audit,
      auditPolicyLookup: {} as AuditPolicyLookup,
      authorization: { effective: vi.fn(async () => ({ grants })) },
    }),
  } as unknown as Runtime
}
function Navigation({ to }: { to: string }) {
  const navigate = useNavigate()
  return h('button', { onClick: () => navigate(to) }, 'Change query context')
}
async function render(node: ReactNode) {
  await act(async () =>
    root.render(h(ConfigProvider, { button: { autoInsertSpace: false } }, node)),
  )
}
async function click(text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === text,
  )
  if (!button) throw new Error('Missing button: ' + text)
  await act(async () => button.click())
}
async function fill(label: string, value: string) {
  const node = [...host.querySelectorAll('label')].find((node) => node.textContent === label),
    input = node?.htmlFor
      ? (document.getElementById(node.htmlFor) as HTMLInputElement | null)
      : null
  if (!input) throw new Error('Missing input: ' + label)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
it('discards a late response from the preceding applied query', async () => {
  let finish!: (value: AuditPage) => void
  const old = new Promise<AuditPage>((resolve) => {
      finish = resolve
    }),
    search = vi
      .fn<Audit['search']>()
      .mockImplementation((query) =>
        query?.actor === 'new' ? Promise.resolve(page('current-query-fact')) : old,
      ),
    r = runtime({ search })
  await render(
    h(
      MemoryRouter,
      { initialEntries: ['/audit?actor=old'] },
      h(AuditWorkspace, { runtime: r, locale: 'zh' }),
      h(Navigation, { to: '/audit?actor=new' }),
    ),
  )
  await click('Change query context')
  expect(host.textContent).toContain('current-query-fact')
  await act(async () => finish(page('late-previous-fact')))
  expect(host.textContent).not.toContain('late-previous-fact')
})
it('keeps applied pagination stable and drops its cursor on an explicit filter change', async () => {
  const search = vi.fn<Audit['search']>().mockResolvedValue(page('safe-fact', 'YWJj')),
    r = runtime({ search })
  await render(
    h(
      MemoryRouter,
      { initialEntries: ['/audit?actor=old&limit=1'] },
      h(AuditWorkspace, { runtime: r, locale: 'zh' }),
    ),
  )
  await click('下一页')
  expect(search.mock.lastCall![0]).toMatchObject({ actor: 'old', cursor: 'YWJj', limit: 1 })
  await fill('主体', 'new')
  await click('查询')
  expect(search.mock.lastCall![0]).toMatchObject({ actor: 'new', limit: 1 })
  expect(search.mock.lastCall![0]).not.toHaveProperty('cursor')
})
it('does not broaden an invalid URL scope or retain the previous safe rows', async () => {
  const search = vi.fn<Audit['search']>().mockResolvedValue(page('previous-authorized-fact')),
    r = runtime({ search })
  await render(
    h(
      MemoryRouter,
      { initialEntries: ['/audit'] },
      h(AuditWorkspace, { runtime: r, locale: 'zh' }),
      h(Navigation, { to: '/audit?from=invalid' }),
    ),
  )
  expect(host.textContent).toContain('previous-authorized-fact')
  const count = search.mock.calls.length
  await click('Change query context')
  expect(search).toHaveBeenCalledTimes(count)
  expect(host.textContent).not.toContain('previous-authorized-fact')
})
it('opens device activity without InventoryRead and uses the detail related-query scope before clearing on denial', async () => {
  const list = vi.fn<Audit['activities']>().mockImplementation(async (_device, query) => {
      if (query?.related) throw { code: 'forbidden', status: 403 }
      return activities
    }),
    activity = vi.fn<Audit['activity']>().mockResolvedValue(detail),
    search = vi.fn<Audit['search']>(),
    r = runtime({ activities: list, activity, search }, [
      { operation: 'operation_read', scope: { kind: 'device', id: 'device' } },
    ])
  await render(
    h(
      MemoryRouter,
      {
        initialEntries: [
          '/audit?view=activities&device=device&policy=11111111-1111-4111-8111-111111111111&from=1&activity=native%3Afact',
        ],
      },
      h(AuditWorkspace, { runtime: r, locale: 'zh' }),
    ),
  )
  expect(host.textContent).toContain('paired-device')
  expect(search).not.toHaveBeenCalled()
  await click('下一页关联事实')
  expect(list.mock.lastCall).toEqual([
    'device',
    { related: 'native:fact', limit: 50, cursor: 'YWJj' },
  ])
  expect(host.textContent).not.toContain('paired-device')
  expect(host.textContent).toContain('当前所选事实的读取权限尚未确认')
})

it('links a known device target or applied device locator without inventing a missing producer device fact', async () => {
  const source = page('recorded-device-target').items[0]!,
    fact = { ...source, deviceId: null, target: { type: 'device', id: 'target-device' } }
  await render(
    h(
      MemoryRouter,
      null,
      h(AuditFactView, {
        fact,
        locale: 'zh',
        context: { view: 'audit', device: 'applied-device', from: 10, until: 30 },
      }),
    ),
  )
  let link = [...host.querySelectorAll('a')].find((node) => node.textContent === '查看设备时间线')!
  expect(new URL(link.href).searchParams.get('device')).toBe('target-device')
  expect(new URL(link.href).searchParams.get('from')).toBe('10')
  expect(fact.deviceId).toBeNull()
  const scoped = { ...fact, target: { type: 'policy', id: 'policy' } }
  await render(
    h(
      MemoryRouter,
      null,
      h(AuditFactView, {
        fact: scoped,
        locale: 'zh',
        context: { view: 'audit', device: 'applied-device' },
      }),
    ),
  )
  link = [...host.querySelectorAll('a')].find((node) => node.textContent === '查看设备时间线')!
  expect(new URL(link.href).searchParams.get('device')).toBe('applied-device')
  await render(h(MemoryRouter, null, h(AuditFactView, { fact: scoped, locale: 'zh' })))
  expect(
    [...host.querySelectorAll('a')].some((node) => node.textContent === '查看设备时间线'),
  ).toBe(false)
})
