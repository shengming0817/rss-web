import { beforeEach } from 'vitest'
import { config } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMdmVuetify } from './ui/vuetify'

// jsdom has no layout engine; keep real Vuetify interactions and only supply browser APIs.
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
beforeEach(() => {
  config.global.plugins = [createPinia(), createMdmVuetify()]
})
Object.defineProperty(globalThis, 'visualViewport', { configurable: true, value: null })
