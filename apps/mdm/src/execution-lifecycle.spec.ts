// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Runtime } from './runtime'
import type { ControlIntent } from '@rss/mdm-execution'
import type { ViewEndpoint } from '@rss/mdm-devices'
import { DeviceControl } from './DeviceControl'
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
