// @vitest-environment jsdom
import { act, createElement as h, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultSchedule, type Policy, type RolloutStage } from '@rss/mdm-policies'
import type { ScopeRead } from '@rss/mdm-scopes'
import { PolicyEditor } from './PolicyEditor'
import { ScopeEditor } from './ScopeEditor'
import { PolicyRolloutEditor } from './PolicyRolloutEditor'
import type { Runtime } from './runtime'

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
function inject<T>(methods: Partial<T>): T {
  return methods as T
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
async function approve() {
  const node = [...host.querySelectorAll('label')]
    .find((node) => node.textContent?.includes('确认范围、资源、调度与潜在影响'))!
    .querySelector<HTMLInputElement>('input')!
  await act(async () => node.click())
}
function policy(): Policy {
  return {
    id,
    revision: 4,
    version: 2,
    versionId: scope,
    state: 'disabled',
    definition: {
      scope,
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
it('reads the original policy after an unknown write without resubmitting or unlocking writes', async () => {
  const change = vi.fn().mockRejectedValue({ cause: 'transport' }),
    read = vi.fn(async () => policy())
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(PolicyEditor, {
          policies: inject<ComponentProps<typeof PolicyEditor>['policies']>({ change, read }),
          scopes: inject<ComponentProps<typeof ScopeEditor>['scopes']>({}),
          resources: inject<ComponentProps<typeof PolicyEditor>['resources']>({}),
          baseline: policy(),
          id,
          initialScope: scope,
          runtime: inject<Runtime>({}),
          instance: id,
          locale: 'zh',
          canWrite: true,
          canRerun: true,
          done() {},
        }),
      ),
    ),
  )
  await approve()
  await click('保存策略定义')
  const original = change.mock.calls[0]![1]
  await click('读取原策略当前状态')
  await click('读取原策略当前状态')
  expect(read).toHaveBeenCalledWith(id)
  expect(change).toHaveBeenCalledTimes(1)
  expect(host.textContent).toContain(original.operationId)
  expect(button('保存策略定义').disabled).toBe(true)
  expect(host.textContent).toContain('不能据此确认原操作')
})
it('keeps an unknown Scope write locked after reading a matching current definition', async () => {
  const baseline: ScopeRead = {
      id,
      revision: 3,
      definition: { targets: [], limitations: null, exclusions: [] },
      resolution: null,
      resolutionRevision: 0,
    },
    change = vi.fn().mockRejectedValue({ cause: 'transport' }),
    read = vi.fn(async () => ({ ...baseline, revision: 4 }))
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(ScopeEditor, {
          scopes: inject<ComponentProps<typeof ScopeEditor>['scopes']>({ change, read }),
          groups: inject<ComponentProps<typeof ScopeEditor>['groups']>({}),
          devices: inject<ComponentProps<typeof ScopeEditor>['devices']>({}),
          id,
          baseline,
          locale: 'zh',
          canWrite: true,
          done() {},
        }),
      ),
    ),
  )
  await click('保存并计算范围')
  await click('读取原范围当前状态')
  expect(change).toHaveBeenCalledTimes(1)
  expect(read).toHaveBeenCalledWith(id)
  expect(button('保存并计算范围').closest('fieldset')?.disabled).toBe(true)
  expect(button('返回目录并读取当前状态').disabled).toBe(true)
  expect(host.textContent).toContain(change.mock.calls[0]![1].operationId)
})
it('requires review again after a deployment wizard returns to an earlier step', async () => {
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(PolicyEditor, {
          policies: inject<ComponentProps<typeof PolicyEditor>['policies']>({}),
          scopes: inject<ComponentProps<typeof ScopeEditor>['scopes']>({}),
          resources: inject<ComponentProps<typeof PolicyEditor>['resources']>({
            list: async () => ({ items: [], nextCursor: null }),
          }),
          baseline: null,
          id,
          initialScope: scope,
          runtime: inject<Runtime>({}),
          instance: id,
          locale: 'zh',
          canWrite: true,
          canRerun: true,
          done() {},
        }),
      ),
    ),
  )
  expect(
    [...host.querySelectorAll('button')]
      .find((node) => node.textContent === '保存策略定义')
      ?.closest('[hidden]'),
  ).not.toBeNull()
  await click('下一步')
  await click('下一步')
  await approve()
  expect(button('保存策略定义').disabled).toBe(false)
  await click('上一步')
  const input = host.querySelector<HTMLInputElement>('input[aria-label="唯一别名"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'changed',
    )
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await click('下一步')
  expect(button('保存策略定义').disabled).toBe(true)
})

it('shows the exact opening time and scope of a single custom rollout stage', async () => {
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(PolicyRolloutEditor, {
          value: [{ scope: id, opensAt: 123, minimumVerifiedPercent: null }],
          scope,
          scopes: inject<ComponentProps<typeof ScopeEditor>['scopes']>({}),
          onChange() {},
          locale: 'zh',
        }),
      ),
    ),
  )
  expect(host.querySelector<HTMLInputElement>('input[aria-label="批次开放时间 1"]')?.value).toBe(
    '123',
  )
  expect(host.textContent).toContain(id)
})
it('can remove the second rollout stage while retaining the first stage exact coordinates', async () => {
  const first = { scope: id, opensAt: 123, minimumVerifiedPercent: null },
    onChange = vi.fn()
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(PolicyRolloutEditor, {
          value: [first, { scope, opensAt: 456, minimumVerifiedPercent: 90 }],
          scope,
          scopes: inject<ComponentProps<typeof ScopeEditor>['scopes']>({}),
          onChange,
          locale: 'zh',
        }),
      ),
    ),
  )
  const remove = [...host.querySelectorAll('button')].filter(
    (node) => node.textContent === '移除此批次',
  )[1]!
  await act(async () => remove.click())
  expect(onChange).toHaveBeenCalledWith([first])
})
it('clears the orphaned preceding-stage gate when removing the first rollout stage', async () => {
  const onChange = vi.fn()
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(PolicyRolloutEditor, {
          value: [
            { scope: id, opensAt: 123, minimumVerifiedPercent: null },
            { scope, opensAt: 456, minimumVerifiedPercent: 90 },
          ],
          scope,
          scopes: inject<ComponentProps<typeof ScopeEditor>['scopes']>({}),
          onChange,
          locale: 'zh',
        }),
      ),
    ),
  )
  await click('移除此批次')
  expect(onChange).toHaveBeenCalledWith([{ scope, opensAt: 456, minimumVerifiedPercent: null }])
})

const changedScope = '33333333-3333-4333-8333-333333333333'
function software(stages: readonly RolloutStage[]): Policy {
  const original = policy()
  return {
    ...original,
    definition: {
      ...original.definition,
      action: {
        kind: 'software',
        channel: 'agent',
        delivery: { kind: 'direct' },
        intent: 'required_install',
        resource: {
          kind: 'software',
          id: 'example/app',
          version: 'v1',
          variants: { windows_x86_64: 'default' },
        },
        rollout: { stages },
        schedule: defaultSchedule(),
        runLifetimeSeconds: 86400,
      },
    },
  }
}
it.each([
  {
    name: 'independent stage scope',
    stage: { scope: id, opensAt: 0, minimumVerifiedPercent: null },
    follows: false,
  },
  {
    name: 'future opening time',
    stage: { scope, opensAt: 2000000000, minimumVerifiedPercent: null },
    follows: false,
  },
  {
    name: 'default whole-scope stage',
    stage: { scope, opensAt: 0, minimumVerifiedPercent: null },
    follows: true,
  },
])('changes the overall Scope without overriding $name', async ({ stage, follows }) => {
  const baseline = software([stage]),
    change = vi.fn<ComponentProps<typeof PolicyEditor>['policies']['change']>(async () => baseline)
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(PolicyEditor, {
          policies: inject<ComponentProps<typeof PolicyEditor>['policies']>({ change }),
          scopes: inject<ComponentProps<typeof ScopeEditor>['scopes']>({
            list: async () => ({
              items: [{ id: changedScope, revision: 1, resolution: null, resolutionRevision: 0 }],
              nextCursor: null,
            }),
            read: async () => ({
              id: changedScope,
              revision: 1,
              definition: { targets: [], limitations: null, exclusions: [] },
              resolution: null,
              resolutionRevision: 0,
            }),
          }),
          resources: inject<ComponentProps<typeof PolicyEditor>['resources']>({
            list: async () => ({ items: [], nextCursor: null }),
          }),
          baseline,
          id,
          initialScope: scope,
          runtime: inject<Runtime>({}),
          instance: id,
          locale: 'zh',
          canWrite: true,
          canRerun: true,
          done() {},
        }),
      ),
    ),
  )
  await click('选择范围')
  await click('使用此范围')
  await approve()
  await click('保存策略定义')
  expect(change).toHaveBeenCalledTimes(1)
  expect(change.mock.calls[0]![1]).toMatchObject({
    input: {
      definition: {
        scope: changedScope,
        action: { rollout: { stages: [follows ? { ...stage, scope: changedScope } : stage] } },
      },
    },
  })
})
it('submits the selected ARM64 architecture for a credential policy', async () => {
  const original = policy(),
    baseline: Policy = {
      ...original,
      definition: {
        ...original.definition,
        action: {
          kind: 'credential',
          operation: { kind: 'collect_bitlocker' },
          architecture: 'x86_64',
          frequency: 'once_per_version',
          schedule: defaultSchedule(),
          runLifetimeSeconds: 86400,
        },
      },
    },
    change = vi.fn<ComponentProps<typeof PolicyEditor>['policies']['change']>(async () => baseline)
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(PolicyEditor, {
          policies: inject<ComponentProps<typeof PolicyEditor>['policies']>({ change }),
          scopes: inject<ComponentProps<typeof ScopeEditor>['scopes']>({}),
          resources: inject<ComponentProps<typeof PolicyEditor>['resources']>({}),
          baseline,
          id,
          initialScope: scope,
          runtime: inject<Runtime>({}),
          instance: id,
          locale: 'zh',
          canWrite: true,
          canRerun: true,
          done() {},
        }),
      ),
    ),
  )
  await act(async () =>
    host
      .querySelector('input[aria-label="所需处理器架构"]')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
  )
  await vi.waitFor(() =>
    expect(
      [...document.querySelectorAll('.ant-select-item-option-content')].some(
        (node) => node.textContent === 'aarch64',
      ),
    ).toBe(true),
  )
  await act(async () =>
    (
      [...document.querySelectorAll('.ant-select-item-option-content')].find(
        (node) => node.textContent === 'aarch64',
      ) as HTMLElement
    ).click(),
  )
  await approve()
  await click('保存策略定义')
  expect(change).toHaveBeenCalledTimes(1)
  expect(change.mock.calls[0]![1]).toMatchObject({
    input: {
      definition: {
        action: {
          kind: 'credential',
          architecture: 'aarch64',
          operation: { kind: 'collect_bitlocker' },
        },
      },
    },
  })
})
