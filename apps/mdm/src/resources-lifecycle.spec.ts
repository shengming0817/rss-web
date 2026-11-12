import { MemoryRouter } from 'react-router-dom'
import { isValidElement } from 'react'
import { DirectoryCatalogContext } from './DirectorySearch'
import { directoryFixtures } from './directory.spec-helper'
// @vitest-environment jsdom
import { act, createElement as h, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Resource, SoftwareBehavior } from '@rss/mdm-resources'
import {
  createContent,
  chunkBytes,
  type ContentPort,
  type DownloadChunk,
  type DownloadSink,
} from '@rss/mdm-content'
import type { SourceView } from '@rss/mdm-software'
import { SoftwareImport } from './SoftwareImport'
import type { SoftwareUseCases } from './SoftwareUi'
import { ResourceMetadata } from './ResourceMetadata'
import { ResourceDirectory } from './Resources'
import type { ResourcesUseCases } from './ResourceCommand'
import { SoftwareMutationState, useSoftwareMutation } from './SoftwareUi'
import { SecretTabs } from './SecretTabs'
import { ContentDownload } from './ContentDownload'
import type { ContentUseCases } from './ContentUpload'
import { CollectionPlan } from './CollectionMappingEditor'
import { SoftwareBehaviorAuthor, emptySoftwareBehavior } from './SoftwareBehaviorAuthor'
import { useMaterialHash } from './useMaterialHash'
import { useAction } from './AdminUi'
import { ResourceMaterialUpload } from './ResourceContent'
import { ContentUpload } from './ContentUpload'
import { bufferedMaterial } from './MaterialSource'
import { SelectionGuard, useSelectionGuard } from './SelectionGuard'

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
function inject<T>(methods: Partial<T>): T {
  return new Proxy(methods as T & object, {
    get(target, key) {
      if (!(key in target)) throw new Error(`Unexpected use case: ${String(key)}`)
      return Reflect.get(target, key)
    },
  }) as T
}
async function render(node: ReactNode) {
  await act(async () =>
    root.render(
      h(
        DirectoryCatalogContext.Provider,
        { value: directoryFixtures },
        isValidElement(node) && node.type === MemoryRouter ? node : h(MemoryRouter, null, node),
      ),
    ),
  )
}
function button(text: string) {
  const value = [...host.querySelectorAll('button')].find((node) => node.textContent === text)
  if (!value) throw new Error(`Missing button: ${text}`)
  return value
}
async function click(text: string) {
  await act(async () => button(text).click())
}
async function fill(label: string, text: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
  if (!input) throw new Error(`Missing input: ${label}`)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function resource(): Resource {
  return {
    id: 'company/app',
    kind: 'software',
    revision: 4,
    origin: null,
    presentation: { name: 'Original', custom: { flag: false, count: 0 } },
    versions: [],
  }
}
function permissionPanel(allowed: boolean, children: ReactNode) {
  return h(SecretTabs, {
    activeKey: 'original',
    authorizedKeys: allowed ? ['original'] : [],
    items: [{ key: 'original', label: 'Operation', forceRender: true, children }],
  })
}
it('searches the kind-filtered software directory through its server query without detail fan-out', async () => {
  const list = vi.fn<ResourcesUseCases['list']>().mockResolvedValue({
      items: [
        {
          id: 'company/one',
          kind: 'software',
          activeVersion: 'resource-v2',
          presentation: { name: 'One', category: 'Tools' },
        },
        {
          id: 'company/two',
          kind: 'software',
          activeVersion: null,
          presentation: { name: 'Two', category: 'Office' },
        },
      ],
      nextCursor: null,
    }),
    read = vi.fn<ResourcesUseCases['read']>(),
    resources = inject<ResourcesUseCases>({ list, read })
  await render(
    h(ResourceDirectory, {
      resources,
      content: inject<ContentUseCases>({}),
      locale: 'en',
      canWrite: false,
      fixedKind: 'software',
      canReadSoftware: true,
    }),
  )
  expect(list).toHaveBeenCalledTimes(1)
  expect(list.mock.calls[0]?.[1]).toBe('software')
  expect(read).not.toHaveBeenCalled()
  expect(host.querySelectorAll('.software-card')).toHaveLength(2)
  list.mockResolvedValue({ items: [{ id: 'company/two', kind: 'software' }], nextCursor: null })
  await fill('Name', "O'Reilly")
  await click('Apply')
  expect(host.querySelectorAll('.software-card')).toHaveLength(1)
  expect(list).toHaveBeenCalledTimes(2)
  expect(list.mock.calls[1]?.[0]?.filter).toBe("presentation.name=icontains='O\\'Reilly'")
  expect(list.mock.calls[1]?.[1]).toBe('software')
  expect(read).not.toHaveBeenCalled()
  expect(host.textContent).not.toContain('Installed devices')
})
it('retains unknown Resource metadata and the original CAS request across permission loss, comparison reads and explicit replay', async () => {
  const value = resource(),
    change = vi
      .fn<ResourcesUseCases['change']>()
      .mockRejectedValueOnce({ status: 503, code: 'operation_unknown' })
      .mockImplementationOnce(async (id, original) => ({
        resource: id,
        request: original.operationId,
        storageRevision: 5,
      })),
    read = vi.fn<ResourcesUseCases['read']>().mockResolvedValue({ ...value, revision: 5 }),
    resources = inject<ResourcesUseCases>({ change, read }),
    panel = (allowed: boolean) =>
      permissionPanel(
        allowed,
        h(ResourceMetadata, {
          resources,
          resource: value,
          canWrite: allowed,
          blocked: false,
          locale: 'en',
        }),
      )
  await render(panel(true))
  await fill('Display name', 'Edited')
  await click('Save resource metadata')
  expect(change).toHaveBeenCalledTimes(1)
  expect(change.mock.calls[0]?.[1]).toMatchObject({
    expectedRevision: 4,
    input: { presentation: { name: 'Edited', custom: { flag: false, count: 0 } } },
  })
  await render(panel(false))
  expect(button('Resubmit original resource request').matches(':disabled')).toBe(true)
  await render(panel(true))
  await click('Read current state of original resource')
  expect(read).toHaveBeenCalledWith(value.id)
  expect(host.textContent).toContain('not the original receipt')
  expect(change).toHaveBeenCalledTimes(1)
  await click('Resubmit original resource request')
  expect(change.mock.calls[1]).toEqual(change.mock.calls[0])
})
it('preserves the full frozen software request while related reads remain observations across permission changes', async () => {
  const draft = {
      source: { id: 'company/source', revision: '1' },
      nativeExport: false,
      arguments: ['0', '0'],
    },
    write = vi
      .fn()
      .mockRejectedValueOnce({ status: 503, code: 'operation_unknown' })
      .mockResolvedValueOnce({ admitted: true }),
    lookup = vi.fn(async () => ({ lifecycle: null }))
  function Mutation({ allowed }: { allowed: boolean }) {
    const mutation = useSoftwareMutation(write, () => {})
    return h(
      'div',
      null,
      h('button', { onClick: () => void mutation.submit('company/app', 4, draft) }, 'Start import'),
      h(SoftwareMutationState, {
        mutation,
        locale: 'en',
        canReplay: allowed,
        confirmedText: 'Acknowledged',
        lookup,
      }),
    )
  }
  const panel = (allowed: boolean) => permissionPanel(allowed, h(Mutation, { allowed }))
  await render(panel(true))
  await click('Start import')
  draft.source.revision = 'changed'
  draft.arguments.push('changed')
  await render(panel(false))
  expect(button('Resubmit original software request').matches(':disabled')).toBe(true)
  await render(panel(true))
  expect(write).toHaveBeenCalledTimes(1)
  await click('Read records for the original operation')
  expect(lookup).toHaveBeenCalledTimes(1)
  expect(host.textContent).toContain('not the original acknowledgement')
  await click('Resubmit original software request')
  expect(write.mock.calls[1]).toEqual(write.mock.calls[0])
  expect(write.mock.calls[1]?.[0]).toMatchObject({
    change: {
      expectedRevision: 4,
      input: { source: { revision: '1' }, nativeExport: false, arguments: ['0', '0'] },
    },
  })
})
const downloadRequest = {
  kind: 'software' as const,
  target: {
    resource: 'company/app',
    version: 'v2',
    variant: 'main',
    platform: 'windows' as const,
    architecture: 'x86_64' as const,
    artifact: { reference: 'content/setup.msi', length: 3, sha256: Array<number>(32).fill(0) },
  },
}
it('clears owned small-file bytes and Blob URLs on permission loss and discards a late response after page hide', async () => {
  const create = vi.fn(() => 'blob:material'),
    revoke = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
  const bytes = new Uint8Array([1, 2, 3]).buffer,
    downloadBytes = vi.fn<ContentUseCases['downloadBytes']>().mockResolvedValueOnce(bytes),
    content = inject<ContentUseCases>({ downloadBytes }),
    panel = (permitted: boolean) =>
      h(ContentDownload, { content, request: downloadRequest, permitted, locale: 'en' })
  await render(panel(true))
  await click('Read small-file download (up to 16 MiB)')
  expect(host.querySelector('a[download]')?.getAttribute('href')).toBe('blob:material')
  await render(panel(false))
  expect(revoke).toHaveBeenCalledWith('blob:material')
  expect(new Uint8Array(bytes)).toEqual(new Uint8Array(3))
  expect(host.querySelector('a[download]')).toBeNull()
  let finish!: (value: ArrayBuffer) => void
  downloadBytes.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await render(panel(true))
  await click('Read small-file download (up to 16 MiB)')
  const late = new Uint8Array([4, 5, 6]).buffer
  await act(async () => {
    window.dispatchEvent(new Event('pagehide'))
    finish(late)
  })
  expect(new Uint8Array(late)).toEqual(new Uint8Array(3))
  expect(create).toHaveBeenCalledTimes(1)
  expect(host.querySelector('a[download]')).toBeNull()
})
it('aborts an open streamed file exactly once on permission loss and never reports it saved', async () => {
  const writer = {
    write: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    abort: vi.fn(async () => {}),
  }
  Object.defineProperty(window, 'showSaveFilePicker', {
    configurable: true,
    value: vi.fn(async () => ({ createWritable: async () => writer })),
  })
  let finish!: () => void, sink!: DownloadSink
  const download = vi.fn<ContentUseCases['download']>(async (_request, target, signal) => {
      sink = target
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      if (signal?.aborted) {
        await target.abort()
        throw new Error('cancelled')
      }
      await target.close()
    }),
    content = inject<ContentUseCases>({ download }),
    panel = (permitted: boolean) =>
      h(ContentDownload, { content, request: downloadRequest, permitted, locale: 'en' })
  await render(panel(true))
  await click('Stream to a file')
  expect(download).toHaveBeenCalledTimes(1)
  await render(panel(false))
  await act(async () => {
    await sink.abort()
    finish()
  })
  expect(writer.abort).toHaveBeenCalledTimes(1)
  expect(writer.close).not.toHaveBeenCalled()
  expect(host.textContent).not.toContain('Material verified and saved')
  Reflect.deleteProperty(window, 'showSaveFilePicker')
})
it('renders complete structured definitions lazily and exposes false and zero when expanded', async () => {
  await render(
    h(CollectionPlan, { value: { definition: { field: { enabled: false, count: 0 } } } }),
  )
  expect(host.textContent).not.toContain('false')
  const outer = host.querySelector('details')!
  await act(async () => {
    outer.open = true
    outer.dispatchEvent(new Event('toggle'))
  })
  const inner = outer.querySelector('details')!
  await act(async () => {
    inner.open = true
    inner.dispatchEvent(new Event('toggle'))
  })
  expect(host.textContent).toContain('false')
  expect(host.textContent).toContain('0')
})

it('authors native invocation fields without dropping ordered duplicate arguments, uninstall/detection or other EXE layout keys', async () => {
  const initial = emptySoftwareBehavior('exe')
  if (initial.kind !== 'exe') throw new Error('fixture')
  const original = {
      ...initial,
      installer: 'setup',
      layout: { helper: 'support/helper.dll' },
      install: { ...initial.install, arguments: ['0', '0'], environment: { EMPTY: '', ZERO: '0' } },
    },
    change = vi.fn<(value: SoftwareBehavior) => void>()
  await render(h(SoftwareBehaviorAuthor, { value: original, onChange: change, locale: 'en' }))
  await fill('Installer material key', 'new-setup')
  expect(change.mock.calls[0]?.[0]).toEqual({ ...original, installer: 'new-setup' })
  expect(original.install.arguments).toEqual(['0', '0'])
  expect(
    host.querySelector('input[aria-label="Install invocation arguments 2"]')?.getAttribute('value'),
  ).toBe('0')
})
it('exposes each current typed behavior family without mutating the authored definition on mount', async () => {
  const change = vi.fn()
  for (const kind of ['msi', 'pkg', 'winget', 'brew', 'exe', 'bundle', 'dmg', 'msix'] as const) {
    const value = emptySoftwareBehavior(kind),
      original = structuredClone(value)
    await render(h(SoftwareBehaviorAuthor, { key: kind, value, onChange: change, locale: 'en' }))
    expect(value).toEqual(original)
    expect(host.querySelector('[aria-label="Installation behavior kind"]')).not.toBeNull()
  }
  expect(change).not.toHaveBeenCalled()
})
it('drops a late File hash after permission loss and erases the last owned chunk', async () => {
  let finish!: (value: ArrayBuffer) => void
  const file = new File(['x'], 'installer.bin'),
    bytes = new Uint8Array([7]).buffer,
    slice = vi.fn(() => ({
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => {
          finish = resolve
        }),
    })),
    apply = vi.fn()
  Object.defineProperty(file, 'slice', { configurable: true, value: slice })
  function Hasher({ allowed }: { allowed: boolean }) {
    const action = useAction(),
      hash = useMaterialHash(allowed, action)
    return h('button', { onClick: () => hash(file, apply) }, 'Hash file')
  }
  await render(h(Hasher, { allowed: true }))
  await click('Hash file')
  expect(slice).toHaveBeenCalledWith(0, 1)
  await render(h(Hasher, { allowed: false }))
  await act(async () => finish(bytes))
  expect(new Uint8Array(bytes)).toEqual(new Uint8Array([0]))
  expect(apply).not.toHaveBeenCalled()
})

it('preserves Bundle install structure, DMG app identity and MSIX deployment siblings when editing nested branch fields', async () => {
  const change = vi.fn<(value: SoftwareBehavior) => void>(),
    bundle = emptySoftwareBehavior('bundle'),
    dmg = emptySoftwareBehavior('dmg'),
    msix = emptySoftwareBehavior('msix')
  if (
    bundle.kind !== 'bundle' ||
    dmg.kind !== 'dmg' ||
    dmg.payload.kind !== 'app_copy' ||
    msix.kind !== 'msix'
  )
    throw new Error('fixture')
  const bundled = {
    ...bundle,
    archive: 'archive',
    manifest: {
      ...bundle.manifest,
      entries: { 'helper.dll': { length: 3, sha256: Array<number>(32).fill(1) } },
    },
    install: {
      ...bundle.install,
      entry: 'install.sh',
      invocation: { ...bundle.install.invocation, arguments: ['0', '0'] },
    },
  }
  await render(
    h(SoftwareBehaviorAuthor, {
      key: 'bundle-edit',
      value: bundled,
      onChange: change,
      locale: 'en',
    }),
  )
  await fill('Bundle install script entry material', 'updated.sh')
  expect(change.mock.lastCall?.[0]).toEqual({
    ...bundled,
    install: { ...bundled.install, entry: 'updated.sh' },
  })
  const mounted = {
    ...dmg,
    image: 'disk-image',
    volume: 'Company',
    payload: {
      ...dmg.payload,
      application: {
        path: 'App.app',
        bundleId: 'com.company.app',
        version: '1.2',
        targetName: 'App.app',
      },
    },
  }
  await render(
    h(SoftwareBehaviorAuthor, { key: 'dmg-edit', value: mounted, onChange: change, locale: 'en' }),
  )
  await fill('DMG application path', 'New.app')
  expect(change.mock.lastCall?.[0]).toEqual({
    ...mounted,
    payload: {
      ...mounted.payload,
      application: { ...mounted.payload.application, path: 'New.app' },
    },
  })
  const registered = {
    ...msix,
    allowUnsigned: false,
    requireSideload: true,
    deployment: {
      kind: 'target_user_registration' as const,
      target: { kind: 'exact' as const, identity: 'old-user' },
    },
  }
  await render(
    h(SoftwareBehaviorAuthor, {
      key: 'msix-edit',
      value: registered,
      onChange: change,
      locale: 'en',
    }),
  )
  await fill('MSIX user identity', 'new-user')
  expect(change.mock.lastCall?.[0]).toEqual({
    ...registered,
    deployment: {
      kind: 'target_user_registration',
      target: { kind: 'exact', identity: 'new-user' },
    },
  })
})
it('cancels a restoring script at the content owner when permission is lost, erases a late first chunk and sends no next range', async () => {
  let finish!: (chunk: DownloadChunk) => void
  const download = vi.fn<ContentPort['download']>(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    ),
    content = createContent(inject<ContentPort>({ download })),
    variant = {
      key: 'main',
      platform: 'windows' as const,
      architecture: 'x86_64' as const,
      declaration: {
        kind: 'script' as const,
        artifact: {
          reference: 'script/source',
          length: chunkBytes + 1,
          sha256: Array<number>(32).fill(0),
        },
        definition: {
          profile: 'power_shell7' as const,
          sql: null,
          runAs: 'system' as const,
          encoding: 'utf8' as const,
          parameters: {},
          output: {},
          bindings: {},
          purpose: { kind: 'action' as const },
          timeoutSeconds: 30,
          outputBytes: 4096,
          maxRows: 1,
        },
      },
    },
    exact: Resource = {
      id: 'company/script',
      kind: 'script',
      revision: 2,
      origin: null,
      presentation: {},
      versions: [
        { id: 'v1', state: 'frozen', digest: Array<number>(32).fill(0), variants: [variant] },
      ],
    },
    panel = (canWrite: boolean) =>
      h(ResourceMaterialUpload, {
        resources: inject<ResourcesUseCases>({}),
        content,
        resource: exact,
        version: 'v1',
        variant,
        locale: 'en',
        canWrite,
        blocked: false,
        canDownload: false,
      })
  await render(panel(true))
  await click('Prepare a new material delivery')
  await click('Restore original content buffer')
  expect(download).toHaveBeenCalledTimes(1)
  const signal = download.mock.calls[0]?.[2]
  expect(signal?.aborted).toBe(false)
  await render(panel(false))
  expect(signal?.aborted).toBe(true)
  const bytes = new Uint8Array(chunkBytes).fill(7).buffer
  await act(async () =>
    finish({ bytes, start: 0, end: chunkBytes - 1, total: chunkBytes + 1, etag: 'fixed' }),
  )
  expect(new Uint8Array(bytes).every((value) => value === 0)).toBe(true)
  expect(download).toHaveBeenCalledTimes(1)
})
it('can discard unwritten local material without locking the selector or sending a request, but retains an unknown begin', async () => {
  const bytes = new Uint8Array([1, 2, 3]).buffer,
    discarded = vi.fn(),
    begin = vi
      .fn<ContentUseCases['begin']>()
      .mockRejectedValue({ status: 503, code: 'operation_unknown' }),
    content = inject<ContentUseCases>({ begin }),
    source = bufferedMaterial(bytes)
  function Panel() {
    const guard = useSelectionGuard()
    return h(
      SelectionGuard.Provider,
      { value: guard.register },
      h('button', { disabled: guard.locked }, 'Change resource'),
      h(ContentUpload, {
        content,
        intent: { id: '11111111-1111-4111-8111-111111111111', target: downloadRequest.target },
        initialSource: source,
        discarded,
        locale: 'en',
        canWrite: true,
      }),
    )
  }
  await render(h(Panel))
  expect(button('Change resource').disabled).toBe(false)
  await click('Discard local material preparation')
  expect(new Uint8Array(bytes)).toEqual(new Uint8Array(3))
  expect(discarded).toHaveBeenCalledTimes(1)
  expect(begin).not.toHaveBeenCalled()
  await click('Begin original upload')
  expect(begin).toHaveBeenCalledTimes(1)
  expect(button('Change resource').disabled).toBe(true)
  expect(
    [...host.querySelectorAll('button')].some(
      (node) => node.textContent === 'Discard local material preparation',
    ),
  ).toBe(false)
})

it('selects the fixed REST metadata document from the exact source protocol instead of asking an operator to guess its filename', async () => {
  const value: SourceView = {
      source: {
        id: 'company/rest',
        revision: '1',
        protocol: {
          kind: 'winget_rest',
          location: 'https://source.example/rest/',
          identifier: 'company',
        },
      },
      snapshot: { id: 'company/rest', revision: '1', sha256: Array<number>(32).fill(1) },
      lifecycle: {
        revision: 1,
        state: 'enabled',
        operation: '11111111-1111-4111-8111-111111111111',
        actor: 'operator',
        at: 1800000000,
        digest: Array<number>(32).fill(1),
      },
    },
    software = inject<SoftwareUseCases>({
      sources: async () => ({
        items: [{ id: 'company/rest', revision: '1', protocol: 'winget_rest', state: 'enabled' }],
        nextCursor: null,
      }),
      source: async () => value,
    })
  await render(
    h(SoftwareImport, {
      software,
      resources: inject<ResourcesUseCases>({}),
      content: inject<ContentUseCases>({}),
      locale: 'en',
      canWrite: true,
      canReadResource: true,
      canReadSoftware: true,
    }),
  )
  const selector = host.querySelector('[aria-label="Exact import source"]')!
  await act(async () => selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
  const option = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(
    (node) => node.textContent === 'company/rest / 1 · winget_rest · enabled',
  )
  expect(option).toBeDefined()
  await act(async () => option!.click())
  await click('Read selected source snapshot')
  expect(host.textContent).toContain('Fixed metadata document for the REST source')
  expect(host.textContent).toContain('manifest.json')
  expect(host.querySelector('[aria-label="Exact manifest files 1"]')).toBeNull()
})

it('can append a verified software artifact after begin returns the formal binding without provenance metadata', async () => {
  const sha256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
      .match(/../g)!
      .map((value) => parseInt(value, 16)),
    canonical = {
      ...downloadRequest.target,
      artifact: { reference: 'installer', length: 3, sha256 },
    },
    content = createContent(
      inject<ContentPort>({
        begin: async (value) => ({
          id: value.id,
          target: canonical,
          resourceDigest: Array<number>(32).fill(1),
          actor: 'operator',
          storageClass: 'artifact',
          inspection: null,
          source: null,
          origin: null,
          offset: 0,
          expires: 2000000000,
          complete: false,
        }),
      }),
    ),
    artifact = { ...canonical.artifact, origin: null },
    intent = content.intent('11111111-1111-4111-8111-111111111111', { ...canonical, artifact }),
    bytes = new Uint8Array([97, 98, 99]).buffer
  await render(
    h(ContentUpload, {
      content,
      intent,
      initialSource: bufferedMaterial(bytes),
      locale: 'en',
      canWrite: true,
    }),
  )
  await click('Verify original material length and digest')
  await click('Begin original upload')
  expect(button('Upload one chunk from observed offset').disabled).toBe(false)
})
