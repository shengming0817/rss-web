// @vitest-environment jsdom
import type { ContentUseCases } from './ContentUpload'
import { act, createElement, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Form } from 'antd'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type {
  MappingResource,
  PreparedMapping,
  PreparedMaterial,
  ValueMapping,
} from '@rss/mdm-resources'
import type { QueryDefinition } from '@rss/mdm-inventory'
import type { UploadSession } from '@rss/mdm-content'
import type { InventoryUseCases } from './FieldEditor'
import type { GroupsUseCases } from './GroupPicker'
import type { DevicesUseCases } from './EndpointPicker'
import type { Runtime } from './runtime'
import { GroupPicker } from './GroupPicker'
import { GroupEditor } from './GroupEditor'
import { QueryExecution } from './InventoryQuery'
import { SavedQueries } from './SavedQueries'
import { SecretTabs } from './SecretTabs'
import { ValueMappingEditor } from './ValueMappingEditor'
import { DeviceDetail } from './DeviceDetail'
import { MappingUpload, type MappingUseCases } from './MappingUpload'
import { CollectionMappings } from './CollectionMappings'

const id = '11111111-1111-4111-8111-111111111111',
  nested = '22222222-2222-4222-8222-222222222222'
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
  await act(async () => {
    root.render(node)
  })
}
function button(text: string): HTMLButtonElement {
  const button = [...host.querySelectorAll('button')].find(
    (node) => node.textContent === text && !node.closest('[hidden]'),
  )
  if (!button) throw new Error(`Missing button: ${text}`)
  return button
}
async function click(text: string) {
  await act(async () => button(text).click())
}
async function tab(text: string) {
  const node = [...host.querySelectorAll<HTMLElement>('[role=tab]')].find(
    (node) => node.textContent === text,
  )
  if (!node) throw new Error(`Missing tab: ${text}`)
  await act(async () => node.click())
}
async function fill(label: string, text: string) {
  const input = [...host.querySelectorAll<HTMLInputElement>('input')].find(
    (node) => node.getAttribute('aria-label') === label && !node.closest('[hidden]'),
  )
  if (!input) throw new Error(`Missing input: ${label}`)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function definition(): QueryDefinition {
  return {
    filter: 'custom.ready==false',
    fields: ['custom.ready'],
    sort: [],
    scope: { selector: { kind: 'device' }, quantifier: 'one' },
  }
}
it('replays only the original frozen query after the visible editor definition changes', async () => {
  const query = vi
      .fn<InventoryUseCases['query']>()
      .mockRejectedValueOnce({ status: 503, code: 'outcome_unknown' })
      .mockImplementation(async (task) => ({ task, statusUrl: `/api/v1/device-queries/${task}` })),
    inventory = inject<InventoryUseCases>({
      query,
      queryStatus: async (task) => ({
        task,
        status: 'pending',
        summary: { total: 0, matched: 0, unknown: 0 },
        resultUrl: null,
        failure: null,
      }),
    })
  await render(createElement(QueryExecution, { inventory, locale: 'zh', definition: definition() }))
  await click('运行资产查询')
  const original = query.mock.calls[0]!
  await render(
    createElement(QueryExecution, {
      inventory,
      locale: 'zh',
      definition: { ...definition(), filter: 'custom.ready==true' },
    }),
  )
  expect(query).toHaveBeenCalledTimes(1)
  await click('显式重提原查询')
  expect(query.mock.calls[1]).toEqual(original)
  expect(query.mock.calls[1]?.[1].filter).toBe('custom.ready==false')
})
it('keeps unknown saved-definition intent across a permission refresh without auto replay', async () => {
  const saved = { id, revision: 7, definition: { name: 'Saved original', query: definition() } },
    put = vi
      .fn<InventoryUseCases['putSavedQuery']>()
      .mockRejectedValueOnce({ status: 503, code: 'outcome_unknown' })
      .mockResolvedValue({ ...saved, revision: 8 }),
    inventory = inject<InventoryUseCases>({
      savedQueries: async () => ({ items: [{ id, name: 'Saved original' }], nextCursor: null }),
      savedQuery: async () => saved,
      putSavedQuery: put,
    })
  const page = (allowed: boolean) =>
    createElement(SecretTabs, {
      authorizedKeys: allowed ? ['saved'] : [],
      items: [
        {
          key: 'saved',
          label: 'Saved',
          children: createElement(SavedQueries, { inventory, locale: 'zh', canWrite: allowed }),
        },
      ],
    })
  await render(page(true))
  await click('Saved original')
  await fill('查询名称', 'Changed name')
  await click('保存查询定义')
  expect(put).toHaveBeenCalledTimes(1)
  const original = put.mock.calls[0]!
  expect(original[1].expectedRevision).toBe(7)
  await render(page(false))
  await render(page(true))
  expect(put).toHaveBeenCalledTimes(1)
  await click('显式重提原保存查询变更')
  expect(put.mock.calls[1]).toEqual(original)
})
it('continues an empty candidate page and verifies full group detail before using the next candidate', async () => {
  const list = vi
      .fn<GroupsUseCases['list']>()
      .mockResolvedValueOnce({ items: [], nextCursor: 'b3BhcXVl' })
      .mockResolvedValue({
        items: [{ id: nested, assetContext: 'endpoint', presentation: { name: 'Second page' } }],
        nextCursor: null,
      }),
    selected = vi.fn(),
    read = vi.fn<GroupsUseCases['read']>().mockResolvedValue({
      group: {
        id: nested,
        kind: 'static',
        systemSelector: null,
        assetContext: 'endpoint',
        presentation: { name: 'Second page' },
        revision: 1,
        memberCount: 0,
        memberVersion: 0,
        calculationRevision: 0,
        ruleVersion: null,
        deleted: false,
      },
      criteria: null,
      freshness: 'current',
      memberSet: null,
    }),
    groups = inject<GroupsUseCases>({ list, read })
  await render(
    createElement(GroupPicker, {
      groups,
      locale: 'zh',
      assetContext: 'endpoint',
      referenceableFor: id,
      value: null,
      onChange: selected,
    }),
  )
  expect(button('下一页').disabled).toBe(false)
  await click('下一页')
  await click('使用此组')
  expect(list.mock.calls[1]?.[0]).toMatchObject({
    cursor: 'b3BhcXVl',
    referenceableFor: id,
    filter: "assetContext=='endpoint';deleted==false",
  })
  expect(read).toHaveBeenCalledWith(nested)
  expect(selected).toHaveBeenCalledWith(nested)
})
it('does not enable group deletion for an empty authorized reference list with deletionBlocked=true', async () => {
  const groups = inject<GroupsUseCases>({
      references: async () => ({ items: [], nextCursor: null, deletionBlocked: true }),
    }),
    devices = inject<DevicesUseCases>({ endpoints: async () => ({ items: [], nextCursor: null }) }),
    baseline = {
      group: {
        id,
        kind: 'static' as const,
        systemSelector: null,
        assetContext: 'endpoint' as const,
        presentation: { name: 'Blocked empty', description: '' },
        revision: 1,
        calculationRevision: 0,
        memberVersion: 0,
        memberCount: 0,
        ruleVersion: null,
        deleted: false,
      },
      criteria: null,
      memberSet: null,
      freshness: 'current' as const,
    }
  await render(
    createElement(
      MemoryRouter,
      null,
      createElement(GroupEditor, {
        groups,
        devices,
        locale: 'zh',
        id,
        baseline,
        canWrite: true,
        canPreview: true,
        canRecompute: true,
        done: vi.fn(),
      }),
    ),
  )
  const label = [...host.querySelectorAll('label')].find((node) =>
    node.textContent?.includes('已核对服务端删除保护'),
  )!
  await act(async () => label.querySelector<HTMLInputElement>('input')!.click())
  expect(
    button('删除设备组').disabled || !!button('删除设备组').closest('fieldset[disabled]'),
  ).toBe(true)
})
it('edits a root pointer without losing typed enum values or recursive column mappings', async () => {
  let latest: ValueMapping = {
    pointer: '/old',
    conversion: { kind: 'enum', values: { off: false, zero: 0 } },
    columns: {
      nested: {
        pointer: '/child',
        conversion: { kind: 'scale', numerator: 0, denominator: 10 },
        columns: {},
      },
    },
  }
  function Editor() {
    const [value, setValue] = useState(latest)
    return createElement(
      Form,
      null,
      createElement(ValueMappingEditor, {
        locale: 'zh',
        value,
        onChange: (next) => {
          latest = next
          setValue(next)
        },
      }),
    )
  }
  await render(createElement(Editor))
  await fill('JSON 指针', '/new')
  expect(latest.pointer).toBe('/new')
  expect(latest.conversion).toEqual({ kind: 'enum', values: { off: false, zero: 0 } })
  expect(latest.columns['nested']?.conversion).toEqual({
    kind: 'scale',
    numerator: 0,
    denominator: 10,
  })
})
it('hides denied device facts while retaining the original unknown manual write through a later valid read', async () => {
  const endpoint = {
      id: 'endpoint',
      status: 'active' as const,
      assetState: 'active' as const,
      primaryMdmRegistration: null,
      channels: [],
      enrollments: [],
      platform: { state: 'unknown' as const, values: [] },
    },
    reference = { kind: 'endpoint' as const, id: 'endpoint' },
    view = { reference, association: null, endpoints: [endpoint], fields: {} },
    deviceView = vi
      .fn()
      .mockResolvedValueOnce(view)
      .mockRejectedValueOnce({ status: 403, code: 'forbidden' })
      .mockResolvedValue(view),
    assign = vi
      .fn()
      .mockRejectedValueOnce({ status: 503, code: 'outcome_unknown' })
      .mockResolvedValue({ device: 'endpoint', field: 'custom.ready', revision: 1 }),
    inventory = {
      view: async () => ({ ...view, lists: {}, inventorySources: [] }),
      layout: async () => ({ revision: 0, editable: true, groups: [] }),
      inventory: async () => ({
        device: 'endpoint',
        collectionScope: { kind: 'device' },
        channels: [],
        fields: {},
        lists: {},
        quality: [],
        revisions: {},
      }),
      scopes: async () => ({
        device: 'endpoint',
        assetCut: {
          tenant: '11111111-1111-4111-8111-111111111111',
          epoch: '22222222-2222-4222-8222-222222222222',
          snapshot: '1:2:',
        },
        items: [],
        nextCursor: null,
      }),
      field: async () => ({
        field: 'custom.ready',
        version: 1,
        definition: {
          key: 'custom.ready',
          version: 1,
          valueType: { kind: 'boolean' },
          manual: true,
          nullable: true,
          sources: { manual: 0 },
          platforms: ['windows'],
          sensitivity: 'standard',
          searchable: true,
          unit: null,
          itemKey: null,
          timeSeries: null,
        },
      }),
      assign,
    },
    runtime = {
      administration: () => ({
        binding: 'bound-session',
        devices: { view: deviceView, endpoint: async () => ({ ...endpoint, capabilities: [] }) },
        inventory,
        connections: {},
        authorization: {
          effective: async () => ({
            grants: [
              { operation: 'inventory_read', scope: { kind: 'all_devices' } },
              { operation: 'inventory_assign', scope: { kind: 'all_devices' } },
            ],
          }),
        },
      }),
    } as unknown as Runtime
  await render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/devices/endpoint/endpoint'] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/devices/:kind/:id',
          element: createElement(DeviceDetail, { runtime, locale: 'zh' }),
        }),
      ),
    ),
  )
  await tab('资产信息')
  await fill('手工字段键', 'custom.ready')
  await click('读取字段与写入版本')
  await click('设置手工值')
  expect(assign).toHaveBeenCalledTimes(1)
  const original = assign.mock.calls[0]
  await click('读取最新设备事实')
  expect([...host.querySelectorAll('fieldset[hidden]')].length).toBeGreaterThan(0)
  expect(
    [...host.querySelectorAll('button')]
      .find((n) => n.textContent === '显式重提原手工值变更')
      ?.closest('[hidden]'),
  ).toBeTruthy()
  await click('读取最新设备事实')
  expect(assign).toHaveBeenCalledTimes(1)
  await click('显式重提原手工值变更')
  expect(assign.mock.calls[1]).toEqual(original)
})

function preparedUpload(): PreparedMaterial {
  return {
    target: {
      resource: 'rss/collection.native',
      version: '2.0',
      variant: 'collection',
      platform: 'windows',
      architecture: 'x86_64',
      artifact: { reference: 'collection.json', length: 3, sha256: Array<number>(32).fill(0) },
    },
    bytes: new Uint8Array([1, 2, 3]).buffer,
  }
}
function uploadSession(upload: PreparedMaterial): UploadSession {
  return {
    id: nested,
    target: upload.target,
    resourceDigest: Array<number>(32).fill(1),
    actor: 'operator',
    storageClass: 'native_configuration',
    inspection: null,
    source: null,
    origin: null,
    offset: 0,
    expires: 2000000000,
    complete: false,
  }
}
function mappingResource(): MappingResource {
  const resource: MappingResource = {
    id: 'rss/collection.native',
    kind: 'native_collection',
    revision: 1,
    presentation: { name: 'Native' },
    origin: null,
    versions: [
      {
        id: '1.0',
        state: 'active',
        digest: Array<number>(32).fill(1),
        variants: [
          {
            key: 'collection',
            platform: 'windows',
            architecture: 'x86_64',
            declaration: {
              kind: 'native_collection',
              artifact: {
                reference: 'collection.json',
                length: 3,
                sha256: Array<number>(32).fill(0),
              },
              definition: {
                scope: { kind: 'device' },
                applicability: {
                  minimumOsVersion: null,
                  minimumBuild: null,
                  editions: [],
                  enrollments: [],
                  tools: {},
                  capabilities: [],
                },
                adapter: 'windows_read',
                timeoutSeconds: 30,
                outputBytes: 65536,
                mappings: {},
              },
            },
          },
        ],
      },
    ],
  }
  return {
    ...resource,
    versions: resource.versions.map((version) => ({
      ...version,
      variants: [...version.variants, { ...version.variants[0]!, architecture: 'aarch64' }],
    })),
  }
}
it('can explicitly begin the original metadata after hiding an unstarted upload and restore bytes afterward', async () => {
  const upload = preparedUpload(),
    fresh = preparedUpload(),
    begin = vi.fn<ContentUseCases['begin']>().mockResolvedValue(uploadSession(upload)),
    restore = vi.fn<MappingUseCases['restore']>().mockResolvedValue(fresh),
    mappings = inject<MappingUseCases>({ restore }),
    content = inject<ContentUseCases>({ begin, verify: async () => {} }),
    show = (allowed: boolean) =>
      createElement(SecretTabs, {
        authorizedKeys: allowed ? ['mapping'] : [],
        items: [
          {
            key: 'mapping',
            label: 'Mapping',
            children: createElement(MappingUpload, {
              mappings,
              content,
              intent: { id: nested, target: upload.target },
              upload,
              locale: 'zh',
              canWrite: true,
            }),
          },
        ],
      })
  await render(show(true))
  await render(show(false))
  await render(show(true))
  expect(new Uint8Array(upload.bytes)).toEqual(new Uint8Array([0, 0, 0]))
  expect(button('开始原上传').disabled).toBe(false)
  expect(button('恢复原内容缓冲').disabled).toBe(false)
  await click('开始原上传')
  expect(begin).toHaveBeenCalledTimes(1)
  expect(begin.mock.calls[0]?.[0].id).toBe(nested)
  expect(restore).not.toHaveBeenCalled()
  await click('恢复原内容缓冲')
  expect(restore).toHaveBeenCalledWith(upload.target, undefined, expect.any(AbortSignal))
  expect(button('从已确认位置续传一块').disabled).toBe(false)
  expect(new Uint8Array(fresh.bytes)).toEqual(new Uint8Array([1, 2, 3]))
})
it('erases a restored upload buffer that arrives after its panel unmounts', async () => {
  const upload = preparedUpload(),
    late = preparedUpload()
  let finish!: (upload: PreparedMaterial) => void
  const mappings = inject<MappingUseCases>({
    restore: () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  })
  await render(
    createElement(MappingUpload, {
      mappings,
      content: inject<ContentUseCases>({
        verify: async () => {},
        read: async () => uploadSession(upload),
      }),
      intent: { id: nested, target: upload.target },
      upload,
      locale: 'zh',
      canWrite: true,
      initialAvailable: false,
    }),
  )
  await click('读取原上传状态')
  await click('恢复原内容缓冲')
  await render(null)
  await act(async () => finish(late))
  expect(new Uint8Array(late.bytes)).toEqual(new Uint8Array([0, 0, 0]))
})
it('erases all prepared mapping content that arrives after leaving the resource editor', async () => {
  const resource = mappingResource(),
    upload = preparedUpload()
  let finish!: (prepared: PreparedMapping) => void
  const mappings = inject<MappingUseCases>({
    resources: async () => ({ items: [{ id: resource.id }], nextCursor: null }),
    resource: async () => resource,
    prepare: () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  })
  await render(
    createElement(CollectionMappings, {
      mappings,
      content: inject<ContentUseCases>({
        verify: async () => {},
        read: async () => uploadSession(preparedUpload()),
      }),
      locale: 'zh',
      canWrite: true,
    }),
  )
  await click(resource.id)
  await fill('新固定版本名称', '2.0')
  await click('准备新版本内容与摘要')
  await render(null)
  await act(async () =>
    finish({
      resource: resource.id,
      change: {
        operationId: id,
        expectedRevision: 1,
        input: {
          action: 'version',
          version: '2.0',
          kind: 'native_collection',
          variants: resource.versions[0]!.variants,
        },
      },
      materials: [upload],
    }),
  )
  expect(new Uint8Array(upload.bytes)).toEqual(new Uint8Array([0, 0, 0]))
})
it('erases external original-upload recovery content that arrives after the recovery page unmounts', async () => {
  const late = preparedUpload()
  let finish!: (upload: PreparedMaterial) => void
  const mappings = inject<MappingUseCases>({
    resources: async () => ({ items: [], nextCursor: null }),
    restore: () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  })
  await render(
    createElement(CollectionMappings, {
      mappings,
      content: inject<ContentUseCases>({
        verify: async () => {},
        read: async () => uploadSession(preparedUpload()),
      }),
      locale: 'zh',
      canWrite: true,
    }),
  )
  await fill('资源标识', late.target.resource)
  await fill('原上传标识', nested)
  await click('读取并核验原上传')
  await render(null)
  await act(async () => finish(late))
  expect(new Uint8Array(late.bytes)).toEqual(new Uint8Array([0, 0, 0]))
})

it('recovers an unknown recompute by exact replay and reads only the returned server task identity', async () => {
  const change = vi
      .fn<GroupsUseCases['change']>()
      .mockRejectedValueOnce({ cause: 'transport', code: 'outcome_unknown' })
      .mockResolvedValue({
        task: nested,
        target: id,
        kind: 'group',
        statusUrl: `/api/v1/groups/${id}/tasks/${nested}`,
      }),
    task = vi.fn<GroupsUseCases['task']>().mockResolvedValue({
      task: nested,
      target: id,
      kind: 'group',
      status: 'running',
      processed: 0,
      members: 0,
      failure: null,
      failureDetail: null,
      replacementTask: null,
    }),
    groups = inject<GroupsUseCases>({
      change,
      task,
      references: async () => ({ items: [], nextCursor: null, deletionBlocked: false }),
    }),
    devices = inject<DevicesUseCases>({ endpoints: async () => ({ items: [], nextCursor: null }) }),
    baseline = {
      group: {
        id,
        kind: 'static' as const,
        systemSelector: null,
        assetContext: 'endpoint' as const,
        presentation: { name: 'Recompute' },
        revision: 1,
        calculationRevision: 0,
        memberVersion: 0,
        memberCount: 0,
        ruleVersion: null,
        deleted: false,
      },
      criteria: null,
      memberSet: null,
      freshness: 'current' as const,
    }
  await render(
    createElement(
      MemoryRouter,
      null,
      createElement(GroupEditor, {
        groups,
        devices,
        locale: 'zh',
        id,
        baseline,
        canWrite: true,
        canPreview: true,
        canRecompute: true,
        done: vi.fn(),
      }),
    ),
  )
  await click('请求正式重算')
  expect(task).not.toHaveBeenCalled()
  expect(host.textContent).not.toContain('读取原设备组任务')
  await click('显式重提原设备组请求')
  expect(change.mock.calls[1]).toEqual(change.mock.calls[0])
  expect(task).toHaveBeenCalledWith(id, nested)
  expect(host.querySelector<HTMLInputElement>('[aria-label="原设备组任务标识"]')?.value).toBe(
    nested,
  )
})
