import { isValidElement } from 'react'
import { DirectoryCatalogContext } from './DirectorySearch'
import { directoryFixtures } from './directory.spec-helper'
// @vitest-environment jsdom
import type { ContentUseCases } from './ContentUpload'
import { act, createElement, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Form } from 'antd'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type {
  MappingResource,
  PreparedMapping,
  PreparedMaterial,
  ValueMapping,
} from '@rss/mdm-resources'
import type {
  FieldDetail,
  Operation,
  QueryDefinition,
  RetentionPolicy,
  RetentionReference,
} from '@rss/mdm-inventory'
import type { OperationDiagnostics } from '@rss/mdm-audit'
import { FieldCatalog } from './FieldCatalog'
import type { ResourceUploadSession } from '@rss/mdm-content'
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
import { decodeMdmError } from '@rss/api/mdm'
import { Devices } from './Devices'
import { DeviceDetail } from './DeviceDetail'
import { MappingUpload, type MappingUseCases } from './MappingUpload'
import { CollectionMappings } from './CollectionMappings'
import { Compliance } from './Compliance'

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
it('uses the smaller compliance page default when restoring a filter-only URL', async () => {
  const list = vi.fn().mockResolvedValue({ items: [], nextCursor: null })
  const runtime = {
    administration: () => ({
      binding: 'tenant/principal/session',
      compliance: { list },
      groups: {},
      authorization: {
        effective: async () => ({
          grants: [{ operation: 'compliance_rule_read', scope: { kind: 'tenant' } }],
        }),
      },
    }),
  } as unknown as Runtime
  await render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/compliance?compliance.filter=enabled==true'] },
      createElement(Compliance, { runtime, locale: 'zh' }),
    ),
  )
  expect(list).toHaveBeenCalledWith(expect.objectContaining({ limit: 50, filter: 'enabled==true' }))
})
async function render(node: ReactNode) {
  await act(async () => {
    root.render(
      createElement(
        DirectoryCatalogContext.Provider,
        { value: directoryFixtures },
        isValidElement(node) && node.type === MemoryRouter
          ? node
          : createElement(MemoryRouter, null, node),
      ),
    )
  })
}
function button(text: string): HTMLButtonElement {
  const button = [...host.querySelectorAll('button')].find(
    (node) =>
      node.textContent?.replace(/\s/g, '') === text.replace(/\s/g, '') && !node.closest('[hidden]'),
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
    filter: "((assetContext=='endpoint';deleted=='false'))",
  })
  expect(read).toHaveBeenCalledWith(nested)
  expect(selected).toHaveBeenCalledWith(nested, 'Second page')
})
it.each(['blocker', 'continuation', 'unreadable'] as const)(
  'keeps group deletion blocked with %s direct references even when recursive impacts are empty',
  async (state) => {
    const groups = inject<GroupsUseCases>({
        references: async () => {
          if (state === 'unreadable') throw { status: 403, code: 'forbidden' }
          return {
            items:
              state === 'blocker'
                ? [
                    {
                      kind: 'scope',
                      id: nested,
                      revision: 2,
                      roles: ['target'],
                      release: 'edit_or_delete_referencing_object',
                      policy: null,
                      stage: null,
                    },
                  ]
                : [],
            nextCursor: state === 'continuation' ? 'opaque' : null,
          }
        },
        impacts: async () => ({ items: [], nextCursor: null }),
      }),
      devices = inject<DevicesUseCases>({
        endpoints: async () => ({ items: [], nextCursor: null }),
      }),
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
  },
)
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
  let completeRead!: (value: unknown) => void
  const endpoint = {
      id: 'endpoint',
      status: 'active' as const,
      assetState: 'active' as const,
      platform: { state: 'unknown' as const, values: [] },
      channel: null,
      source: null,
      registeredAt: null,
      lastCommunicationReceivedAt: null,
      enrollment: null,
    },
    reference = { kind: 'endpoint' as const, id: 'endpoint' },
    view = { reference, association: null, endpoints: [endpoint], fields: {} },
    deviceView = vi
      .fn()
      .mockResolvedValueOnce(view)
      .mockRejectedValueOnce(decodeMdmError(403, { code: 'permission_denied' }))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            completeRead = resolve
          }),
      )
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
  expect(
    [...host.querySelectorAll('button')]
      .find((n) => n.textContent === '显式重提原手工值变更')
      ?.closest('[hidden]'),
  ).toBeTruthy()
  await act(async () => completeRead(view))
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
function uploadSession(upload: PreparedMaterial): ResourceUploadSession {
  return {
    purpose: 'resource',
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
              intent: { purpose: 'resource', id: nested, target: upload.target },
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
      intent: { purpose: 'resource', id: nested, target: upload.target },
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
      references: async () => ({ items: [], nextCursor: null }),
      impacts: async () => ({ items: [], nextCursor: null }),
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

it('keeps a failed device continuation until explicit retry, then restarts with the same query controls', async () => {
  const endpoints = vi
    .fn<DevicesUseCases['endpoints']>()
    .mockResolvedValue({ items: [], nextCursor: 'page-2' })
  const runtime = {
    administration: () => ({
      binding: 'read-session',
      devices: {
        endpoints,
        endpointStatistics: async () => ({
          statistics: { total: 0, active: 0, pending: 0, revoked: 0 },
          asOf: 100,
        }),
      },
    }),
  } as unknown as Runtime
  await render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/devices?tab=endpoints'] },
      createElement(Devices, { runtime, locale: 'zh' }),
    ),
  )
  await fill('状态', 'active')
  await click('应用')
  await fill('每页', '3')
  for (const label of ['排序', '列']) {
    const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
    await act(async () => input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
    const option = document.querySelector<HTMLElement>(
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:not(.ant-select-item-option-disabled)',
    )
    expect(option).not.toBeNull()
    await act(async () => option!.click())
  }
  const before = endpoints.mock.calls.at(-1)![0]
  expect(before).toMatchObject({
    filter: "status=icontains='active'",
    limit: 3,
    sort: ['id'],
    fields: expect.arrayContaining(['id']),
  })
  endpoints.mockRejectedValueOnce(decodeMdmError(409, { code: 'query_read_conflict' }))
  await click('下一页')
  const failed = endpoints.mock.calls.at(-1)![0],
    count = endpoints.mock.calls.length
  expect(failed).toEqual({ ...before, cursor: 'page-2' })
  expect(host.textContent).toContain('读取期间依据发生变化')
  expect(endpoints).toHaveBeenCalledTimes(count)
  endpoints.mockRejectedValueOnce(decodeMdmError(409, { code: 'query_cursor_invalidated' }))
  await click('重新读取')
  expect(endpoints.mock.calls.at(-1)![0]).toEqual(failed)
  expect(host.textContent).toContain('分页上下文已失效')
  await click('保留条件重新开始')
  expect(endpoints.mock.calls.at(-1)![0]).toEqual(before)
  expect(endpoints.mock.calls.at(-1)![1]).toBeInstanceOf(AbortSignal)
})

it('reruns unavailable fixed results only on explicit action with a new task and the original definition', async () => {
  const query = vi
      .fn<InventoryUseCases['query']>()
      .mockImplementation(async (task) => ({ task, statusUrl: `/api/v1/device-queries/${task}` })),
    items = vi
      .fn<InventoryUseCases['queryItems']>()
      .mockRejectedValue(decodeMdmError(409, { code: 'query_result_unavailable' })),
    inventory = inject<InventoryUseCases>({
      query,
      queryItems: items,
      queryStatus: async (task) => ({
        task,
        status: 'completed',
        summary: { total: 1, matched: 1, unknown: 0 },
        resultUrl: `/api/v1/device-queries/${task}/items`,
        failure: null,
      }),
    })
  await render(createElement(QueryExecution, { inventory, locale: 'zh', definition: definition() }))
  await click('运行资产查询')
  const original = query.mock.calls[0]!
  expect(items).toHaveBeenCalledTimes(1)
  await render(
    createElement(QueryExecution, {
      inventory,
      locale: 'zh',
      definition: { ...definition(), filter: 'custom.ready==true' },
    }),
  )
  expect(query).toHaveBeenCalledTimes(1)
  await click('重新查询')
  expect(query).toHaveBeenCalledTimes(2)
  expect(query.mock.calls[1]![0]).not.toBe(original[0])
  expect(query.mock.calls[1]![1]).toEqual(original[1])
  expect(items.mock.calls[1]![0]).toBe(query.mock.calls[1]![0])
})
it('keeps each device directory query through tab changes and restores endpoint paging from URL', async () => {
  const endpoints = vi.fn<DevicesUseCases['endpoints']>(async () => ({
      items: [],
      nextCursor: null,
    })),
    views = vi.fn<DevicesUseCases['views']>(async () => ({ items: [], nextCursor: null })),
    runtime = {
      administration: () => ({
        binding: 'query-session',
        devices: {
          endpoints,
          views,
          viewStatistics: async () => ({
            statistics: { deviceViewCount: 0, endpointCount: 0 },
            asOf: 1,
          }),
          endpointStatistics: async () => ({ statistics: {}, asOf: 1 }),
        },
      }),
    } as unknown as Runtime
  function Location() {
    return createElement('output', { 'data-location': true }, useLocation().search)
  }
  const params = new URLSearchParams({
    tab: 'views',
    'devices.filter': "search=icontains='Mac'",
    'devices.cursor': 'views-second',
    'endpoints.filter': "status=='active'",
    'endpoints.cursor': 'endpoints-second',
  })
  await render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/devices?' + params] },
      createElement(Location),
      createElement(Devices, { runtime, locale: 'zh' }),
    ),
  )
  await tab('终端目录')
  expect(endpoints.mock.calls.at(-1)?.[0]).toMatchObject({
    filter: "status=='active'",
    cursor: 'endpoints-second',
  })
  await tab('设备视图')
  const current = new URLSearchParams(host.querySelector('[data-location]')!.textContent!)
  expect(current.get('devices.filter')).toBe("search=icontains='Mac'")
  expect(current.get('devices.cursor')).toBe('views-second')
  expect(current.get('endpoints.cursor')).toBe('endpoints-second')
})

it.each(['column', 'sort'])(
  'resets an unavailable device view %s and preserves the working query',
  async (setting) => {
    const views = vi.fn<DevicesUseCases['views']>(async () => ({ items: [], nextCursor: null })),
      runtime = {
        administration: () => ({
          binding: 'query-session',
          devices: {
            views,
            viewStatistics: async () => ({
              statistics: { deviceViewCount: 0, endpointCount: 0 },
              asOf: 1,
            }),
          },
        }),
      } as unknown as Runtime
    function Location() {
      return createElement('output', { 'data-location': true }, useLocation().search)
    }
    const filter = "search=icontains='Mac'",
      params = new URLSearchParams({
        tab: 'views',
        'devices.filter': filter,
        'devices.limit': '20',
        'devices.cursor': 'views-second',
        'endpoints.cursor': 'endpoints-second',
      })
    params.append('devices.field', setting === 'column' ? 'key' : 'reference')
    params.append('devices.field', 'association')
    params.append('devices.sort', '-reference.id')
    if (setting === 'sort') params.append('devices.sort', 'key')

    await render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/devices?' + params] },
        createElement(Location),
        createElement(Devices, { runtime, locale: 'zh' }),
      ),
    )
    expect(views).not.toHaveBeenCalled()
    await click('重置失效设置')
    expect(views).toHaveBeenCalledExactlyOnceWith(
      {
        filter,
        limit: 20,
        fields: ['reference', 'association'],
        sort: ['-reference.id'],
      },
      expect.any(AbortSignal),
    )
    const current = new URLSearchParams(host.querySelector('[data-location]')!.textContent!)
    expect(current.has('devices.cursor')).toBe(false)
    expect(current.get('endpoints.cursor')).toBe('endpoints-second')
    expect(current.getAll('devices.field')).toEqual(['reference', 'association'])
    expect(current.getAll('devices.sort')).toEqual(['-reference.id'])
  },
)

const retention = {
  key: 'asset_history',
  revision: 1,
  rawSeconds: 60,
  summarySeconds: 120,
  restoreSeconds: 0,
}
const telemetryField: FieldDetail = {
  field: 'custom.asset_history',
  version: 1,
  definition: {
    key: 'custom.asset_history',
    version: 1,
    valueType: { kind: 'number' },
    nullable: true,
    manual: false,
    sources: { 'agent.script': 0 },
    platforms: ['macos'],
    sensitivity: 'standard',
    unit: null,
    searchable: false,
    itemKey: null,
    timeSeries: {
      kind: 'gauge',
      valuePath: [],
      intervalStartPath: null,
      dimensions: {},
      aggregations: ['min'],
      maxResources: 1,
      retention: { key: retention.key, revision: retention.revision },
    },
  },
}
function retentionCatalog(
  methods: Partial<InventoryUseCases>,
  diagnostics: Partial<OperationDiagnostics> = {},
  key = 'tenant-a',
  canWrite = true,
) {
  return createElement(FieldCatalog, {
    key,
    locale: 'zh',
    inventory: inject<InventoryUseCases>({
      fields: async () => ({ dictionary: '1', items: [], nextCursor: null }),
      ...methods,
    }),
    diagnostics: inject<OperationDiagnostics>(diagnostics),
    canWrite,
    canReadReferences: false,
  })
}
async function lookUpRetention(revision: string) {
  await fill('查询策略键', retention.key)
  await fill('查询策略版本', revision)
  await click('读取精确保留策略')
}
async function startFirstRetentionDraft() {
  await click('管理遥测保留策略')
  await click('起草首版保留策略')
  await fill('新策略键', retention.key)
  await fill('原始数据时长（秒）', '60')
  await fill('汇总时长（秒）', '120')
  await fill('删除恢复时长（秒）', '0')
}

it('keeps a lost publication unconfirmed after an exact version read and reconciles the original UUID', async () => {
  const publish = vi
      .fn<(change: Operation<RetentionPolicy>) => Promise<RetentionPolicy>>()
      .mockImplementationOnce(async ({ input }) => input)
      .mockRejectedValueOnce(
        Object.assign(decodeMdmError(503, { code: 'operation_unknown' }), {
          requestId: nested,
        }),
      )
      .mockRejectedValueOnce(decodeMdmError(409, { code: 'operation_conflict' })),
    diagnostics = vi.fn<OperationDiagnostics['operation']>(),
    revised = { ...retention, revision: 2, summarySeconds: 180 },
    methods = { publishRetentionPolicy: publish, retentionPolicy: async () => revised }
  await render(retentionCatalog(methods, { operation: diagnostics }))
  await startFirstRetentionDraft()
  for (const invalid of ['59', '120.1', '4294967296']) {
    await fill('汇总时长（秒）', invalid)
    await click('发布保留策略')
    expect(publish).not.toHaveBeenCalled()
  }
  await fill('汇总时长（秒）', '120')
  await click('发布保留策略')
  expect(host.textContent).toContain(`${retention.key} · 版本 1`)
  await click('基于此版本起草新版')
  await fill('汇总时长（秒）', '180')
  await click('发布保留策略')
  const change = publish.mock.calls[1]![0]
  expect(change.input).toEqual(revised)
  expect(button('发布保留策略').disabled).toBe(true)
  expect(host.textContent).not.toContain('策略发布已确认')
  expect(host.textContent).toContain(nested)
  expect(host.querySelector('a[href*="operation-diagnostics"]')).toBeNull()

  await lookUpRetention('2')
  expect(host.textContent).toContain('原发布结果待确认')
  const detail = {
    operation: { product: 'mdm', owner: 'asset', operationId: change.operationId },
    auditEvidence: { availability: 'not_requested' },
    requestEvidence: { availability: 'not_requested' },
    executionEvidence: { availability: 'no_durable_evidence' },
    currentResourceUrl: null,
  } as const
  diagnostics.mockResolvedValueOnce({
    ...detail,
    originalResult: { availability: 'unavailable' },
  })
  await click('读取原发布回执')
  expect(host.textContent).toContain('原发布结果待确认')
  expect(host.textContent).not.toContain('显式重提原发布请求')
  diagnostics.mockResolvedValueOnce({ ...detail, originalResult: { availability: 'not_found' } })
  await click('读取原发布回执')
  expect(publish).toHaveBeenCalledTimes(2)
  await click('显式重提原发布请求')
  expect(publish.mock.calls[2]![0]).toBe(change)
  expect(host.textContent).toContain('原发布结果待确认')
  expect(host.textContent).toContain(change.operationId)

  diagnostics.mockResolvedValueOnce({
    ...detail,
    originalResult: {
      availability: 'available',
      value: {
        operationId: change.operationId,
        revision: 2,
        object: null,
        state: null,
        accepted: null,
        enabled: null,
        recordedAt: null,
        completedAt: null,
        executions: [],
        stages: [],
      },
    },
  })
  await click('读取原发布回执')
  expect(diagnostics).toHaveBeenLastCalledWith({ owner: 'asset', operationId: change.operationId })
  expect(host.textContent).toContain('策略发布已确认')
  expect(host.textContent).toContain(`${retention.key} · 版本 2`)
  expect(host.textContent).not.toContain('原发布结果待确认')
  expect(host.textContent).not.toContain('基于此版本起草新版')
  expect(publish).toHaveBeenCalledTimes(3)
})

it('keeps the previous success cleared when a new retention publication conflicts', async () => {
  const publish = vi
    .fn<(change: Operation<RetentionPolicy>) => Promise<RetentionPolicy>>()
    .mockImplementationOnce(async ({ input }) => input)
    .mockRejectedValueOnce(decodeMdmError(409, { code: 'operation_conflict' }))
  await render(retentionCatalog({ publishRetentionPolicy: publish }))
  await startFirstRetentionDraft()
  await click('发布保留策略')
  expect(host.textContent).toContain('策略发布已确认')

  await click('基于此版本起草新版')
  await fill('汇总时长（秒）', '180')
  await click('发布保留策略')
  expect(publish).toHaveBeenCalledTimes(2)
  expect(host.textContent).toContain('内容已变化')
  expect(host.textContent).not.toContain('策略发布已确认')
  expect(host.textContent).not.toContain('原发布结果待确认')
  expect(button('发布保留策略').disabled).toBe(true)
})

it('requires applying a verified version before saving an existing telemetry field', async () => {
  const putField = vi.fn(async () => telemetryField),
    policyRead = vi.fn(async ({ revision }: RetentionReference) =>
      revision === 2 ? { ...retention, revision } : null,
    ),
    methods = {
      fields: async () => ({
        dictionary: '1',
        items: [{ ...telemetryField.definition!, operations: [] }],
        nextCursor: null,
      }),
      field: async () => telemetryField,
      putField,
      retentionPolicy: policyRead,
    }
  await render(retentionCatalog(methods))
  await click(telemetryField.field)
  expect(
    host.querySelector<HTMLInputElement>('input[type="checkbox"]:checked:disabled'),
  ).not.toBeNull()
  expect(button('保存字段新版本').disabled).toBe(true)
  await click('核对或更换保留策略')
  expect(host.querySelector<HTMLInputElement>('[aria-label="查询策略键"]')?.value).toBe(
    retention.key,
  )
  await click('读取精确保留策略')
  expect(host.textContent).toContain('该策略版本不存在')
  expect(button('保存字段新版本').disabled).toBe(true)
  await fill('查询策略版本', '2')
  await click('读取精确保留策略')
  await click('应用到字段草稿')
  expect(putField).not.toHaveBeenCalled()
  expect(button('保存字段新版本').disabled).toBe(false)
  await render(retentionCatalog(methods, {}, 'tenant-a', false))
  await render(retentionCatalog(methods))
  expect(button('保存字段新版本').disabled).toBe(true)
  await click('核对或更换保留策略')
  await fill('查询策略版本', '2')
  await click('读取精确保留策略')
  await click('应用到字段草稿')
  await click('保存字段新版本')
  expect(putField).toHaveBeenCalledWith(
    telemetryField.field,
    expect.objectContaining({
      expectedRevision: 1,
      input: expect.objectContaining({
        definition: expect.objectContaining({
          version: 2,
          timeSeries: expect.objectContaining({ retention: { key: retention.key, revision: 2 } }),
        }),
      }),
    }),
  )
})

it('allows explicitly leaving an unresolved conflicting version before rebasing edited durations', async () => {
  const competing = { ...retention, revision: 2, rawSeconds: 90, restoreSeconds: 30 }
  const publish = vi
    .fn<(change: Operation<RetentionPolicy>) => Promise<RetentionPolicy>>()
    .mockRejectedValueOnce(decodeMdmError(503, { code: 'operation_unknown' }))
    .mockRejectedValueOnce(decodeMdmError(409, { code: 'operation_conflict' }))
    .mockImplementation(async ({ input }) => input)
  const diagnostics = vi
    .fn<OperationDiagnostics['operation']>()
    .mockImplementation(async (operation) => ({
      operation: { ...operation, product: 'mdm' },
      originalResult: { availability: 'not_found' },
      auditEvidence: { availability: 'not_requested' },
      requestEvidence: { availability: 'not_requested' },
      executionEvidence: { availability: 'no_durable_evidence' },
      currentResourceUrl: null,
    }))
  await render(
    retentionCatalog(
      {
        publishRetentionPolicy: publish,
        retentionPolicy: async ({ revision }) => (revision === 2 ? competing : retention),
      },
      { operation: diagnostics },
    ),
  )
  await click('管理遥测保留策略')
  await lookUpRetention('1')
  await click('基于此版本起草新版')
  await fill('汇总时长（秒）', '180')
  await click('发布保留策略')
  await click('读取原发布回执')
  expect(publish).toHaveBeenCalledTimes(1)

  await click('显式重提原发布请求')
  expect(publish).toHaveBeenCalledTimes(2)
  expect(publish.mock.calls[1]![0]).toBe(publish.mock.calls[0]![0])
  expect(host.textContent).toContain('原发布结果待确认')
  expect(button('发布保留策略').disabled).toBe(true)
  expect(button('基于此版本起草新版').disabled).toBe(true)

  await click('读取原发布回执')
  expect(host.textContent).not.toContain('放弃跟进原发布')
  await lookUpRetention('2')
  await click('放弃跟进原发布')
  expect(host.textContent).not.toContain('原发布结果待确认')
  await click('基于此版本起草新版')
  await click('发布保留策略')
  expect(publish).toHaveBeenCalledTimes(3)
  expect(publish.mock.calls[2]![0]).toMatchObject({
    expectedRevision: 2,
    input: { ...competing, revision: 3, summarySeconds: 180 },
  })
  expect(publish.mock.calls[2]![0].operationId).not.toBe(publish.mock.calls[0]![0].operationId)
})

it('drops late policy results when tenant or permission context changes', async () => {
  let finish!: (policy: RetentionPolicy) => void
  const oldRead = vi.fn(
      (_reference: RetentionReference, _signal?: AbortSignal) =>
        new Promise<RetentionPolicy>((resolve) => {
          finish = resolve
        }),
    ),
    newRead = vi.fn(async () => null)
  await render(retentionCatalog({ retentionPolicy: oldRead }))
  await click('管理遥测保留策略')
  await lookUpRetention('1')
  expect(oldRead).toHaveBeenCalledTimes(1)
  await render(retentionCatalog({ retentionPolicy: oldRead }, {}, 'tenant-a', false))
  await act(async () => finish(retention))
  expect(oldRead.mock.calls[0]?.[1]?.aborted).toBe(true)
  expect(host.textContent).not.toContain('管理遥测保留策略')

  await render(retentionCatalog({ retentionPolicy: oldRead }))
  await click('管理遥测保留策略')
  await lookUpRetention('2')
  expect(oldRead).toHaveBeenCalledTimes(2)
  await render(retentionCatalog({ retentionPolicy: newRead }, {}, 'tenant-b'))
  await act(async () => finish(retention))
  expect(oldRead.mock.calls[1]?.[1]?.aborted).toBe(true)
  await click('管理遥测保留策略')
  expect(host.querySelector<HTMLInputElement>('[aria-label="查询策略键"]')?.value).toBe('')
  expect(newRead).not.toHaveBeenCalled()
})
