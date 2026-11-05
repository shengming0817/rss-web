// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createTenantSetup } from '@rss/mdm-tenant-setup'
import type { Progress, SetupPort } from '@rss/mdm-tenant-setup'
import { createRuntimeDiagnostics } from '@rss/mdm-runtime-diagnostics'
import type { Snapshot } from '@rss/mdm-runtime-diagnostics'
import type { Runtime } from './runtime'
import { TenantSetup } from './TenantSetup'
import { Diagnostics } from './Diagnostics'
import { SetupEntry } from './SetupEntry'
import { Settings } from './Settings'
import { setupDestination } from './setup-presentation'
const tenant = '11111111-1111-4111-8111-111111111111'
let host: HTMLDivElement, root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const computed = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((e) => computed(e))
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
function button(label: string) {
  const button = [...document.querySelectorAll('button')].find(
    (b) => b.textContent === label && !b.closest('[hidden]'),
  )
  if (!button) throw new Error('Missing button ' + label)
  return button
}
async function click(label: string) {
  await act(async () => button(label).click())
}
async function render(runtime: Runtime, component = TenantSetup) {
  await act(async () => root.render(h(MemoryRouter, null, h(component, { runtime, locale: 'zh' }))))
}
function fixture() {
  const progress: Progress = {
    tenantId: tenant,
    saved: {
      revision: 2,
      intent: {
        channels: ['windows_mdm'],
        capabilities: { smtp: { kind: 'skip', reason: 'Not needed' } },
        completionRequested: false,
      },
    },
    steps: [
      { id: 'windows_mdm', status: 'ready', reason: null, evidence: [] },
      { id: 'smtp', status: 'skipped', reason: 'Not needed', evidence: [] },
    ],
    canComplete: true,
    complete: false,
  }
  const port: SetupPort = {
    read: vi.fn(async () => progress),
    catalog: vi.fn(async () => ({ items: [], domains: [] })),
    update: vi.fn(async (command) => ({
      operationId: command.operationId,
      saved: { revision: command.expectedRevision + 1, intent: command.intent },
    })),
    operation: vi.fn(async (id) => ({
      operationId: id,
      saved: { revision: 3, intent: progress.saved.intent },
    })),
  }
  const setup = createTenantSetup(port, tenant)
  const effective = vi.fn(async () => ({
    grants: [
      { operation: 'registration_configuration_read', scope: { kind: 'tenant' } },
      { operation: 'registration_configuration_write', scope: { kind: 'tenant' } },
      { operation: 'runtime_diagnostics_read', scope: { kind: 'tenant' } },
    ],
  }))
  const state = { identity: { hasLocalPassword: true } }
  const administration = {
    binding: 'session-a',
    tenantSetup: setup,
    authorization: { effective },
    settingsCatalog: port.catalog,
    diagnostics: createRuntimeDiagnostics({
      snapshot: async () => ({
        source: 'mock',
        alive: true,
        ready: true,
        channels: [],
        components: [],
      }),
    }),
  }
  const runtime = {
    management: false,
    owner: {
      subscribe: () => () => {},
      getSnapshot: () => state,
      reauthenticate: vi.fn(async () => {}),
    },
    administration: () => administration,
  } as unknown as Runtime
  return { progress, port, setup, runtime, effective, administration }
}
it('retains an unknown original request through navigation and queries it without replay', async () => {
  const f = fixture()
  vi.mocked(f.port.update).mockRejectedValueOnce({ status: 503, code: 'outcome_unknown' })
  await render(f.runtime)
  await click('保存意图')
  expect(f.port.update).toHaveBeenCalledTimes(1)
  const original = f.setup.getSnapshot()!
  expect(button('保存意图').disabled).toBe(true)
  await act(async () => root.render(h('div', null, 'away')))
  await render(f.runtime)
  expect(host.textContent).toContain(original.operationId)
  await click('查询原操作')
  expect(f.port.update).toHaveBeenCalledTimes(1)
  expect(f.port.operation).toHaveBeenCalledWith(original.operationId)
  expect(f.setup.getSnapshot()).toBeNull()
})
it('requires a separate completion confirmation and current server progress after its receipt', async () => {
  const f = fixture()
  await render(f.runtime)
  await click('下一步')
  await click('下一步')
  await click('确认完成初始化')
  expect(f.port.update).not.toHaveBeenCalled()
  // Ant Design defaults to OK when no app ConfigProvider is mounted in this injected test.
  const ok = [...document.querySelectorAll('.ant-modal-footer button')].find((b) =>
    b.classList.contains('ant-btn-primary'),
  ) as HTMLButtonElement
  await act(async () => ok.click())
  expect(f.port.update).toHaveBeenCalledWith(
    expect.objectContaining({ intent: expect.objectContaining({ completionRequested: true }) }),
  )
  expect(host.textContent).toContain('完成与健康以重新读取的进度为准')
  expect(host.textContent).not.toContain('初始化已确认，后续健康')
})
it('does not re-open first setup after previously confirmed intent degrades', async () => {
  const f = fixture()
  vi.mocked(f.port.read).mockResolvedValue({
    ...f.progress,
    saved: {
      ...f.progress.saved,
      intent: { ...f.progress.saved.intent, completionRequested: true },
    },
    canComplete: false,
    complete: false,
  })
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(SetupEntry, {
          runtime: f.runtime,
          locale: 'zh',
          children: h('p', null, 'daily workspace'),
        }),
      ),
    ),
  )
  expect(host.textContent).toContain('daily workspace')
})
it('clears diagnostic snapshot while refreshing and after an independent permission revocation', async () => {
  const f = fixture(),
    snapshot: Snapshot = {
      source: 'mock',
      alive: true,
      ready: true,
      channels: [],
      components: [
        {
          owner: 'policy',
          health: 'degraded',
          readiness: 'ready',
          task: 'failed',
          reasons: [],
          dependencies: [],
          queues: [{ name: 'private-work', count: null, truncated: null }],
          progress: null,
          recovery: null,
        },
      ],
    }
  let resolve!: (value: Snapshot) => void
  const read = vi.fn(async () => snapshot)
  f.administration.diagnostics = createRuntimeDiagnostics({ snapshot: read })
  await render(f.runtime, Diagnostics)
  expect(host.textContent).toContain('未观察，不表示零积压')
  vi.mocked(read).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  await click('刷新当前观察')
  expect(host.textContent).not.toContain('private-work')
  await act(async () => resolve(snapshot))
  expect(host.textContent).toContain('private-work')
  f.effective.mockResolvedValueOnce({ grants: [] })
  await click('刷新当前观察')
  expect(host.textContent).not.toContain('private-work')
  expect(host.textContent).toContain('当前账户没有运行诊断读取权限')
})
it('does not expose catalog hrefs as navigation or permit arbitrary owner locators', async () => {
  const f = fixture()
  vi.mocked(f.port.catalog).mockResolvedValue({
    items: [],
    domains: [
      { id: 'untrusted', href: 'javascript:alert(1)' },
      { id: 'policies', href: 'https://untrusted.invalid' },
    ],
  })
  await render(f.runtime, Settings)
  expect([...host.querySelectorAll('a')].map((a) => a.getAttribute('href'))).not.toContain(
    'https://untrusted.invalid',
  )
  expect([...host.querySelectorAll('a')].some((a) => a.href.startsWith('javascript:'))).toBe(false)
  expect(setupDestination('policies')).toBe('/policies')
  expect(setupDestination('https://untrusted.invalid')).toBeNull()
})

it('routes an unconfirmed configuration writer to setup, but keeps a read-only user at the workspace', async () => {
  const f = fixture()
  const entry = () =>
    h(
      MemoryRouter,
      null,
      h(
        Routes,
        null,
        h(Route, {
          path: '/',
          element: h(SetupEntry, {
            runtime: f.runtime,
            locale: 'zh',
            children: h('p', null, 'daily workspace'),
          }),
        }),
        h(Route, { path: '/setup', element: h('p', null, 'first configuration journey') }),
      ),
    )
  await act(async () => root.render(entry()))
  expect(host.textContent).toContain('first configuration journey')
  await act(async () => root.render(h('p', null, 'away')))
  f.effective.mockResolvedValue({
    grants: [{ operation: 'registration_configuration_read', scope: { kind: 'tenant' } }],
  })
  await act(async () => root.render(entry()))
  expect(host.textContent).toContain('daily workspace')
})

it('retains unknown original identity through a later 403 and restored presentation permissions', async () => {
  const f = fixture()
  vi.mocked(f.port.update)
    .mockRejectedValueOnce({ status: 503, code: 'outcome_unknown' })
    .mockRejectedValueOnce({ status: 403, code: 'forbidden' })
  await render(f.runtime)
  await click('保存意图')
  const original = f.setup.getSnapshot()
  await click('显式重提原请求')
  expect(f.setup.getSnapshot()).toBe(original)
  await click('刷新当前状态')
  expect(button('保存意图').disabled).toBe(true)
  await click('查询原操作')
  expect(f.setup.getSnapshot()).toBeNull()
  expect(f.port.update).toHaveBeenCalledTimes(2)
})
it('keeps temporarily invalid channel drafts editable rather than validating them during rendering', async () => {
  const f = fixture()
  vi.mocked(f.port.read).mockResolvedValue({
    ...f.progress,
    saved: {
      revision: 2,
      intent: {
        channels: ['agent'],
        capabilities: { task_signing: { kind: 'configure' } },
        completionRequested: false,
      },
    },
  })
  await render(f.runtime)
  await act(async () => (host.querySelector('input[value=agent]') as HTMLInputElement).click())
  expect(host.textContent).toContain('有未保存的意图')
  await click('保存意图')
  expect(f.port.update).not.toHaveBeenCalled()
})

it('offers explicit server-version adoption when another session saved identical intent', async () => {
  const f = fixture()
  await render(f.runtime)
  vi.mocked(f.port.read).mockResolvedValue({
    ...f.progress,
    saved: { ...f.progress.saved, revision: 3 },
  })
  await click('刷新当前状态')
  await click('使用后端当前意图')
  await click('保存意图')
  expect(f.port.update).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 3 }))
})
