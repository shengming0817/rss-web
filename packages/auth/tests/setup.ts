import { afterEach, beforeEach } from 'vitest'
import { config, enableAutoUnmount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'

enableAutoUnmount(afterEach)

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
  // Exercise real leave hooks: Vuetify unmounts overlay content after its transition.
  config.global.stubs = { transition: false, 'transition-group': false }
  config.global.plugins = [createVuetify({ theme: false })]
})
