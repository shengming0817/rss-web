// @vitest-environment jsdom
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Policy, RolloutStage } from '@rss/mdm-policies'
import { PolicyEditor } from './PolicyEditor'
import { Policies } from './Policies'
import { newPolicyAction } from './PolicyActionEditor'
import { PolicyRolloutEditor } from './PolicyRolloutEditor'
import { PolicyScope, emptyScope } from './PolicyScope'
import { ScopeReferences } from './ScopeReferences'
vi.mock('./PolicyNames', () => ({ PolicyNames: () => null }))
const id = '11111111-1111-4111-8111-111111111111',
  scope = '22222222-2222-4222-8222-222222222222'
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
function inject(value: unknown): never {
  return value as never
}
function button(text: string) {
  const node = [...host.querySelectorAll('button')].find(
    (node) => node.textContent === text && !node.closest('[hidden]'),
  )
  if (!node) throw new Error('Missing button: ' + text)
  return node
}
async function click(text: string) {
  await act(async () => button(text).click())
}
async function checkbox(text: string) {
  const node = [...host.querySelectorAll('label')]
    .find((node) => node.textContent?.includes(text))
    ?.querySelector('input')
  if (!node) throw new Error('Missing checkbox: ' + text)
  await act(async () => node.click())
}
async function fill(label: string, value: string) {
  const node = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function policy(): Policy {
  return {
    id,
    revision: 4,
    version: 2,
    versionId: scope,
    state: 'disabled',
    scopes: [],
    definition: {
      scope: emptyScope(),
      alias: 'original',
      customEvent: null,
      action: {
        kind: 'device_access',
        mac: null,
        windows: { kind: 'disabled' },
        selfEnrollment: false,
        role: null,
      },
    },
  }
}
function runtime(operation = vi.fn()) {
  return inject({
    administration: () => ({
      devices: {},
      groups: {},
      operationDiagnostics: { mdm: { operation } },
      policyEvents: {},
    }),
  })
}
async function editor(methods: object, operation = vi.fn()) {
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(PolicyEditor, {
          policies: inject({ preview: async () => null, ...methods }),
          scopes: inject({}),
          resources: inject({}),
          baseline: policy(),
          id,
          runtime: runtime(operation),
          instance: id,
          locale: 'zh',
          canRead: true,
          canWrite: true,
          canRerun: true,
          done() {},
        }),
      ),
    ),
  )
}
it('keeps unknown writes locked after current-state reads and resubmits exactly the original intent', async () => {
  const change = vi.fn().mockRejectedValue({ cause: 'transport' }),
    read = vi.fn(async () => policy())
  await editor({ change, read })
  await checkbox('确认范围、资源、调度与潜在影响')
  await click('保存策略定义')
  const original = change.mock.calls[0]![1]
  await click('读取原策略当前状态')
  expect(read).toHaveBeenCalledWith(id)
  expect(button('保存策略定义').disabled).toBe(true)
  expect(host.textContent).toContain(original.operationId)
  await checkbox('确认使用原标识和原输入重发')
  await click('重提原操作')
  expect(change.mock.calls[1]).toEqual(change.mock.calls[0])
  expect(Object.isFrozen(original.input)).toBe(true)
})
it('only original durable receipts unlock unknown saves', async () => {
  const change = vi.fn().mockRejectedValue({ cause: 'transport' }),
    read = vi.fn(async () => ({ ...policy(), revision: 5 })),
    operation = vi.fn().mockResolvedValue({ originalResult: { availability: 'not_found' } })
  await editor({ change, read }, operation)
  await checkbox('确认范围、资源、调度与潜在影响')
  await click('保存策略定义')
  await click('读取原操作回执')
  expect(read).not.toHaveBeenCalled()
  expect(button('保存策略定义').disabled).toBe(true)
  operation.mockResolvedValue({
    originalResult: {
      availability: 'available',
      value: { operationId: change.mock.calls[0]![1].operationId, object: id },
    },
  })
  await click('读取原操作回执')
  expect(read).toHaveBeenCalledTimes(1)
  expect(change).toHaveBeenCalledTimes(1)
})
it('retains an edited draft through CAS conflict and requires explicit adoption of the new revision', async () => {
  const change = vi
      .fn()
      .mockRejectedValue({ cause: 'wire', status: 409, code: 'revision_conflict' }),
    read = vi.fn(async () => ({ ...policy(), revision: 7 }))
  await editor({ change, read })
  await fill('唯一别名', 'my.draft')
  await checkbox('确认范围、资源、调度与潜在影响')
  await click('保存策略定义')
  await click('读取原策略当前状态')
  expect(host.querySelector<HTMLInputElement>('input[aria-label="唯一别名"]')!.value).toBe(
    'my.draft',
  )
  await click('保留草稿，采用此修订继续编辑')
  await checkbox('确认范围、资源、调度与潜在影响')
  await click('保存策略定义')
  expect(change.mock.calls[1]![1]).toMatchObject({
    expectedRevision: 7,
    input: { definition: { alias: 'my.draft' } },
  })
})
it('edits scope locally and distinguishes null limitations from the explicitly empty intersection', async () => {
  let latest = emptyScope()
  const preview = vi.fn(async (..._args: unknown[]) => ({
    items: [],
    channel: 'agent',
    scanComplete: false,
    stopReason: 'work_budget',
    hasUnknown: true,
    inputFingerprint: 'fixed',
    assetCut: {},
    sources: [],
    asOf: 0,
  }))
  function Editor() {
    const [value, setValue] = useState(latest)
    return h(PolicyScope, {
      owner: { policyId: id },
      policyRevision: 0,
      value,
      saved: null,
      onChange: (value) => {
        latest = value
        setValue(value)
      },
      scopes: inject({ preview }),
      devices: inject({}),
      groups: inject({}),
      runtime: runtime(),
      locale: 'zh',
      canRecompute: true,
      disabled: false,
    })
  }
  await act(async () => root.render(h(MemoryRouter, null, h(Editor))))
  await checkbox('限制范围（交集）')
  expect(latest.limitations).toEqual([])
  expect(preview).not.toHaveBeenCalled()
  await click('预览当前范围样例（不保存）')
  expect(preview.mock.calls[0]?.[1]).toMatchObject({
    expectedRevision: 0,
    definition: { limitations: [] },
  })
  expect(host.textContent).toContain('空样例不能说明范围为空')
  await checkbox('限制范围（交集）')
  expect(latest.limitations).toBeNull()
  expect(host.textContent).not.toContain('本次匹配样例')
})
it('retains stage identities when reordered or removed and accepts an empty unbatched rollout', async () => {
  let latest: readonly RolloutStage[] = [
    { id, scope: emptyScope(), opensAt: 0, minimumVerifiedPercent: null },
    { id: scope, scope: emptyScope(), opensAt: 10, minimumVerifiedPercent: 90 },
  ]
  function Editor() {
    const [value, setValue] = useState(latest)
    return h(PolicyRolloutEditor, {
      value,
      onChange: (value) => {
        latest = value
        setValue(value)
      },
      owner: { policyId: id },
      policyRevision: 0,
      savedScopes: [],
      scopes: inject({}),
      devices: inject({}),
      groups: inject({}),
      runtime: runtime(),
      locale: 'zh',
      canRecompute: false,
      disabled: false,
    })
  }
  await act(async () => root.render(h(MemoryRouter, null, h(Editor))))
  await click('下移批次')
  expect(latest.map((s) => s.id)).toEqual([scope, id])
  expect(latest[0]?.minimumVerifiedPercent).toBeNull()
  await click('移除此批次')
  expect(latest.map((s) => s.id)).toEqual([id])
  await checkbox('分批部署')
  expect(latest).toEqual([])
})
it('converges the whole server state after an original enable receipt, including intervening edits', async () => {
  const current = {
      ...policy(),
      revision: 6,
      state: 'enabled' as const,
      definition: { ...policy().definition, alias: 'another.admin' },
    },
    change = vi.fn().mockRejectedValue({ cause: 'transport' }),
    read = vi.fn(async () => current),
    operation = vi.fn()
  await editor({ change, read }, operation)
  await checkbox('确认已保存范围与动作后启用')
  await click('启用策略')
  operation.mockResolvedValue({
    originalResult: {
      availability: 'available',
      value: { operationId: change.mock.calls[0]![1].operationId, object: id },
    },
  })
  await click('读取原操作回执')
  expect(host.querySelector<HTMLInputElement>('input[aria-label="唯一别名"]')!.value).toBe(
    'another.admin',
  )
  expect(
    host
      .querySelector('[role="switch"][aria-label="保存后启用策略"]')!
      .getAttribute('aria-checked'),
  ).toBe('true')
  expect(host.textContent).not.toContain('确认放弃未保存草稿')
  await checkbox('确认范围、资源、调度与潜在影响')
  await click('保存策略定义')
  expect(change.mock.calls[1]![1]).toMatchObject({
    expectedRevision: 6,
    input: { enabled: true, definition: { alias: 'another.admin' } },
  })
})
it('retains a pending owner but hides policy content while permissions refresh or are revoked', async () => {
  const grants = ['policy_read', 'policy_write'].map((operation) => ({
      operation,
      scope: { kind: 'tenant' },
    })),
    effective = vi.fn().mockResolvedValue({ grants }),
    change = vi.fn(),
    admin = {
      devices: {},
      groups: {},
      operationDiagnostics: {},
      policyEvents: {},
      binding: 'same-session',
      authorization: { effective },
      policies: {
        list: async () => ({ items: [], nextCursor: null }),
        read: async () => policy(),
        change,
      },
      resources: {},
      scopes: {},
    },
    rt = inject({ administration: () => admin })
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        { initialEntries: [`/policies?policy=${id}`] },
        h(Policies, { runtime: rt, locale: 'zh' }),
      ),
    ),
  )
  await fill('唯一别名', 'retained.draft')
  let resolve!: (value: unknown) => void
  effective.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  await click('读取策略权限')
  expect(host.querySelector('input[aria-label="唯一别名"]')!.closest('[hidden]')).not.toBeNull()
  await act(async () => resolve({ grants: [] }))
  expect(host.querySelector('input[aria-label="唯一别名"]')!.closest('[hidden]')).not.toBeNull()
  effective.mockResolvedValue({ grants })
  await click('读取策略权限')
  const input = host.querySelector<HTMLInputElement>('input[aria-label="唯一别名"]')!
  expect(input.closest('[hidden]')).toBeNull()
  expect(input.value).toBe('retained.draft')
  expect(change).not.toHaveBeenCalled()
})
it('keeps a scope recomputation owner mounted until an unknown request is resolved', async () => {
  const action = newPolicyAction('software'),
    scopeRead = {
      id: scope,
      stage: null,
      retired: false,
      task: null,
      revision: 17,
      resolution: null,
      resolutionRevision: 0,
      definition: emptyScope(),
    },
    recompute = vi.fn().mockRejectedValue({ cause: 'transport' }),
    done = vi.fn()
  if (action.kind !== 'software') throw new Error('Expected software')
  const baseline: Policy = {
    ...policy(),
    scopes: [scopeRead],
    definition: {
      ...policy().definition,
      action: {
        ...action,
        rollout: {
          stages: [{ id: scope, scope: emptyScope(), opensAt: 0, minimumVerifiedPercent: null }],
        },
      },
    },
  }
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        { initialEntries: ['/policies?tab=scope'] },
        h(PolicyEditor, {
          policies: inject({}),
          scopes: inject({ read: async () => scopeRead, recompute }),
          resources: inject({ list: async () => ({ items: [], nextCursor: null }) }),
          baseline,
          id,
          runtime: runtime(),
          instance: id,
          locale: 'zh',
          canRead: true,
          canWrite: true,
          canRerun: true,
          done,
        }),
      ),
    ),
  )
  await click('重新计算已保存范围')
  expect(recompute.mock.calls[0]![1]).toMatchObject({ expectedRevision: 4 })
  expect(button('返回策略目录').disabled).toBe(true)
  expect(button('移除此批次').matches(':disabled')).toBe(true)
  const configurationTab = [...host.querySelectorAll<HTMLElement>('[role=tab]')].find(
    (node) => node.textContent === '配置',
  )!
  await act(async () => configurationTab.click())
  expect(host.querySelector<HTMLInputElement>('input[aria-label="策略动作"]')!.disabled).toBe(true)
  expect(done).not.toHaveBeenCalled()
})
it('keeps a scope picker inside its authority fence and allows only name reads after editing is disabled', async () => {
  const change = vi.fn(),
    view = vi.fn(async () => ({
      endpoints: [
        {
          id: 'pc',
          displayName: { kind: 'known', value: { kind: 'string', value: 'Office Mac' } },
        },
      ],
    })),
    devices = inject({ view, views: async () => ({ items: [], nextCursor: null }) })
  function panel(disabled: boolean, hidden: boolean) {
    return h(
      MemoryRouter,
      null,
      h(
        'fieldset',
        { hidden },
        h(ScopeReferences, {
          title: 'Targets',
          value: [{ kind: 'device', id: 'pc' }],
          onChange: change,
          devices,
          groups: inject({}),
          locale: 'zh',
          disabled,
        }),
      ),
    )
  }
  await act(async () => root.render(panel(false, false)))
  await click('添加终端')
  expect(host.querySelector('[role=dialog]')).not.toBeNull()
  await act(async () => root.render(panel(true, true)))
  expect(host.querySelector('[role=dialog]')!.closest('[hidden]')).not.toBeNull()
  expect(
    [...host.querySelectorAll('button')].find((node) => node.textContent === '完成选择')!.disabled,
  ).toBe(true)
  await act(async () => root.render(panel(true, false)))
  await click('取消选择')
  expect(host.querySelector('.ant-tag-close-icon')).toBeNull()
  await click('读取已选名称')
  expect(view).toHaveBeenCalledOnce()
  expect(host.textContent).toContain('Office Mac')
  expect(change).not.toHaveBeenCalled()
})
