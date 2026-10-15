import { afterEach, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
enableAutoUnmount((unmount) => {
  afterEach(() => {
    unmount()
    document.body.innerHTML = ''
    document.body.removeAttribute('style')
    vi.restoreAllMocks()
  })
})
if (!globalThis.ResizeObserver) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    },
  )
}
if (!globalThis.PointerEvent) vi.stubGlobal('PointerEvent', MouseEvent)
for (const name of ['scrollIntoView', 'setPointerCapture', 'releasePointerCapture'] as const) {
  if (!HTMLElement.prototype[name])
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: vi.fn() })
}
if (!HTMLElement.prototype.hasPointerCapture)
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: () => false,
  })
