import { beforeEach } from 'vitest'
import { config } from '@vue/test-utils'
import { createVuetify } from 'vuetify'

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserver
window.matchMedia ??= (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
})
Object.defineProperty(globalThis, 'visualViewport', { configurable: true, value: null })
beforeEach(() => {
  config.global.plugins = [createVuetify({ theme: false })]
})
