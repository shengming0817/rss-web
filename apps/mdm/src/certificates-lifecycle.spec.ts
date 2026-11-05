// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { act, createElement as h, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CertificateArchive, Entry, ExportFile } from '@rss/mdm-certificates/archive'
import { ArchiveExport } from './ArchiveExport'
import { ArchiveMaterialAuthor } from './ArchiveMaterialAuthor'
import { ArchiveVault } from './ArchiveVault'
import { CertificateArchive as ArchivePage } from './CertificateArchive'
import type { Runtime } from './runtime'
import { SecretTabs } from './SecretTabs'
const entryId = '11111111-1111-4111-8111-111111111111',
  operationId = '22222222-2222-4222-8222-222222222222'
let host: HTMLDivElement, root: Root
const createUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL'),
  revokeUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
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
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => `blob:archive-test`),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (createUrlDescriptor) Object.defineProperty(URL, 'createObjectURL', createUrlDescriptor)
  else Reflect.deleteProperty(URL, 'createObjectURL')
  if (revokeUrlDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeUrlDescriptor)
  else Reflect.deleteProperty(URL, 'revokeObjectURL')
})
function inject<T>(methods: Partial<T>): T {
  return new Proxy(methods as T & object, {
    get(target, key) {
      if (!(key in target)) throw new Error(`Unexpected use case: ${String(key)}`)
      return Reflect.get(target, key)
    },
  }) as T
}
async function render(node: ReactNode) {
  await act(async () => root.render(node))
}
function button(text: string) {
  const node = [...host.querySelectorAll('button')].find(
    (node) => node.textContent === text && !node.closest('[hidden]'),
  )
  if (!node) throw new Error(`Missing button: ${text}`)
  return node
}
async function click(text: string) {
  await act(async () => button(text).click())
}
async function fill(label: string, text: string) {
  const formLabel = [...host.querySelectorAll('label')].find(
      (node) => node.textContent === label && !node.closest('[hidden]'),
    ),
    input =
      host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`) ??
      (formLabel?.htmlFor ? (document.getElementById(formLabel.htmlFor) as HTMLInputElement) : null)
  if (!input) throw new Error(`Missing input: ${label}`)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
function exportPage(archive: CertificateArchive, canExport = true, unlocked = true) {
  return h(ArchiveExport, {
    archive,
    target: { entryId, version: 3 },
    locale: 'zh',
    canRead: true,
    canExport,
    unlocked,
  })
}
function entry(): Entry {
  return {
    id: entryId,
    revision: 5,
    retired: false,
    recommendedVersion: 3,
    latest: {
      entryId,
      version: 3,
      actor: 'operator',
      instance: operationId,
      operationId,
      createdAt: 1700000000,
      metadata: {
        name: 'Original',
        category: 'custom',
        owner: '',
        notes: '',
        labels: [],
        usages: [],
        vendor: { flag: false, zero: 0, nested: ['kept'] },
      },
      facts: [],
      requestVersion: null,
      source: 'generate',
    },
  }
}
it('zeros a late archive export after document hiding without recreating a download URL', async () => {
  const response = deferred<readonly ExportFile[]>(),
    bytes = new Uint8Array([1, 2, 3]),
    archive = inject<CertificateArchive>({ export: vi.fn(() => response.promise) })
  await render(exportPage(archive))
  await click('请求导出此版本')
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await act(async () => response.resolve([{ name: 'private.pk8', bytes: bytes.buffer }]))
  expect([...bytes]).toEqual([0, 0, 0])
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  expect(host.querySelector('a[download]')).toBeNull()
})
it.each(['permission', 'expiry', 'close'] as const)(
  'releases all archive file buffers and URLs on %s',
  async (kind) => {
    const first = new Uint8Array([1, 2]),
      second = new Uint8Array([3, 4]),
      archive = inject<CertificateArchive>({
        export: vi.fn(async () => [
          { name: 'one.pk8', bytes: first.buffer },
          { name: 'two.pem', bytes: second.buffer },
        ]),
      })
    await render(exportPage(archive))
    await click('请求导出此版本')
    expect(host.querySelectorAll('a[download]')).toHaveLength(2)
    if (kind === 'close') await click('关闭并清除导出内容')
    else await render(exportPage(archive, kind !== 'permission', kind !== 'expiry'))
    expect([...first, ...second]).toEqual([0, 0, 0, 0])
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(host.querySelectorAll('a[download]')).toHaveLength(0)
  },
)
it('keeps the original unknown export coordinates across permission loss and does not auto-replay', async () => {
  const send = vi
      .fn<CertificateArchive['export']>()
      .mockRejectedValueOnce({ status: 503, code: 'operation_unknown' })
      .mockResolvedValueOnce([{ name: 'one', bytes: new Uint8Array([1]).buffer }]),
    archive = inject<CertificateArchive>({ export: send }),
    panel = (allowed: boolean) =>
      h(SecretTabs, {
        activeKey: 'archive',
        authorizedKeys: allowed ? ['archive'] : [],
        items: [
          {
            key: 'archive',
            label: 'Archive',
            forceRender: true,
            children: exportPage(archive, allowed),
          },
        ],
      })
  await render(panel(true))
  await click('请求导出此版本')
  const original = send.mock.calls[0]![0]
  await render(panel(false))
  await render(panel(true))
  expect(send).toHaveBeenCalledTimes(1)
  await click('使用原操作显式重新导出')
  expect(send.mock.calls[1]![0]).toEqual(original)
  expect(original).toMatchObject({ entryId, version: 3 })
})
it('does not turn an export receipt into received file bytes or a saved-file assertion', async () => {
  const send = vi
      .fn<CertificateArchive['export']>()
      .mockRejectedValue({ status: 503, code: 'operation_unknown' }),
    lookup = vi
      .fn<CertificateArchive['operation']>()
      .mockImplementation(async (original) => ({ ...original, revision: 3 })),
    archive = inject<CertificateArchive>({ export: send, operation: lookup })
  await render(exportPage(archive))
  await click('请求导出此版本')
  await click('读取原导出回执')
  expect(lookup).toHaveBeenCalledWith(
    expect.objectContaining({ action: 'export', entryId, version: 3, expectedRevision: null }),
  )
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  expect(host.textContent).toContain('浏览器是否收到或保存文件仍须单独确认')
  expect(send).toHaveBeenCalledOnce()
})
it('retains nested unknown metadata while authoring a new version from the independent detail revision', async () => {
  const generate = vi
      .fn<CertificateArchive['generate']>()
      .mockResolvedValue({ operationId, action: 'generate', entryId, version: 6, revision: 6 }),
    archive = inject<CertificateArchive>({ generate })
  await render(
    h(ArchiveMaterialAuthor, {
      archive,
      entry: entry(),
      entryId,
      locale: 'zh',
      canRead: true,
      canWrite: true,
      unlocked: true,
      categories: ['custom'],
      onRefresh: () => {},
    }),
  )
  await fill('证书名称', 'Edited')
  await fill('通用名称 CN', 'Tenant CA')
  await click('提交生成材料')
  expect(generate).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedRevision: 5,
      metadata: expect.objectContaining({
        name: 'Edited',
        vendor: { flag: false, zero: 0, nested: ['kept'] },
      }),
    }),
  )
})
it('clears late import buffers and selected files after leaving the material tab', async () => {
  const response = deferred<ArrayBuffer>(),
    bytes = new Uint8Array([1, 2, 3]),
    send = vi.fn<CertificateArchive['import']>(),
    archive = inject<CertificateArchive>({ import: send }),
    file = new File(['abc'], 'key.pem')
  Object.defineProperty(file, 'arrayBuffer', { value: () => response.promise })
  await render(
    h(ArchiveMaterialAuthor, {
      archive,
      entry: null,
      entryId,
      locale: 'zh',
      canRead: true,
      canWrite: true,
      unlocked: true,
      categories: [],
      onRefresh: () => {},
    }),
  )
  const tabs = [...host.querySelectorAll<HTMLElement>('[role=tab]')]
  await act(async () => tabs.find((tab) => tab.textContent === '导入材料')!.click())
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  await click('提交导入材料')
  await act(async () => tabs.find((tab) => tab.textContent === '生成材料')!.click())
  await act(async () => response.resolve(bytes.buffer))
  expect(send).not.toHaveBeenCalled()
  expect([...bytes]).toEqual([0, 0, 0])
  expect(input.value).toBe('')
})
it('clears the archive master password on submission and ignores a late unlock after hiding', async () => {
  const response = deferred<{
      initialized: boolean
      generation: number
      unlockedUntil: number | null
    }>(),
    unlock = vi.fn<CertificateArchive['unlock']>(() => response.promise),
    changed = vi.fn(),
    archive = inject<CertificateArchive>({ unlock })
  await render(
    h(ArchiveVault, {
      archive,
      vault: { initialized: true, generation: 1, unlockedUntil: null },
      locale: 'zh',
      canRead: true,
      canWrite: false,
      canUnlock: true,
      onVault: changed,
      onRefresh: () => {},
    }),
  )
  await fill('档案主密码', 'synthetic-secret-password')
  await click('解锁档案')
  expect(host.querySelector<HTMLInputElement>('input[type=password]')!.value).toBe('')
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await act(async () =>
    response.resolve({ initialized: true, generation: 1, unlockedUntil: 1900000000 }),
  )
  expect(changed).not.toHaveBeenCalled()
  expect(unlock).toHaveBeenCalledOnce()
})

it('starts with the archive directory and opens one explicit material task with keyboard focus', async () => {
  const archive = inject<CertificateArchive>({
      list: async () => ({
        tenantId: entryId,
        asOf: 1700000000,
        reminderDays: 30,
        alerts: { expired: 0, expiring: 0, notYetValid: 0 },
        items: [],
        nextCursor: null,
      }),
      vault: async () => ({ initialized: true, generation: 1, unlockedUntil: 1900000000 }),
      settings: async () => ({ revision: 0, value: { reminderDays: 30, categories: [] } }),
    }),
    runtime = {
      administration: () => ({ binding: 'archive-session', certificateArchive: archive }),
    } as unknown as Runtime
  await render(
    h(ArchivePage, {
      runtime,
      locale: 'zh',
      canRead: true,
      canWrite: true,
      canUnlock: true,
      canExport: true,
    }),
  )
  expect(host.textContent).not.toContain('提交生成材料')
  expect(host.textContent).not.toContain('请求导出此版本')
  expect(host.textContent).not.toContain('保存档案设置')
  await click('新建档案材料')
  expect(host.textContent).toContain('提交生成材料')
  const passwordControls = [...host.querySelectorAll<HTMLInputElement>('input[type="password"]')]
  expect(passwordControls.length).toBeGreaterThan(1)
  expect(new Set(passwordControls.map((node) => node.id)).size).toBe(passwordControls.length)
  expect(
    document.activeElement?.closest<HTMLFieldSetElement>('fieldset.permission-panel')?.hidden,
  ).toBe(false)
  expect(document.activeElement?.tagName).toBe('INPUT')
  await click('返回档案目录')
  const generate = [...host.querySelectorAll('button')].find(
    (node) => node.textContent === '提交生成材料',
  )!
  expect(generate.closest('[hidden]')).not.toBeNull()
  await click('按精确版本导出')
  expect(button('请求导出此版本')).toBeDefined()
  expect(generate.closest('[hidden]')).not.toBeNull()
})

it('forgets a master-password draft when write permission removes its form', async () => {
  const archive = inject<CertificateArchive>({}),
    props = {
      archive,
      vault: { initialized: true, generation: 1, unlockedUntil: null },
      locale: 'zh' as const,
      canRead: true,
      canWrite: true,
      canUnlock: true,
      onVault: () => {},
      onRefresh: () => {},
    }
  await render(h(ArchiveVault, props))
  await fill('新主密码（至少 12 字符）', 'draft-sensitive-master-password')
  await render(h(ArchiveVault, { ...props, canWrite: false }))
  await render(h(ArchiveVault, props))
  expect(
    [...host.querySelectorAll<HTMLInputElement>('input[type="password"]')].some(
      (node) => node.value === 'draft-sensitive-master-password',
    ),
  ).toBe(false)
})
