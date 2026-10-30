// @vitest-environment jsdom
import { act, createElement as h, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Policy } from '@rss/mdm-policies'
import type { ScopeRead } from '@rss/mdm-scopes'
import { PolicyEditor } from './PolicyEditor'
import { ScopeEditor } from './ScopeEditor'
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
