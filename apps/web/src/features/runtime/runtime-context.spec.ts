import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { runtimeApiPlugin, useRuntimeApi } from './runtime-context'

describe('Runtime API context', () => {
  it('provides only the runtime capability', () => {
    const api = { inventory: vi.fn() }
    const Consumer = defineComponent({
      setup: () => ({ same: useRuntimeApi() === api }),
      template: '<span>{{ same }}</span>',
    })
    expect(mount(Consumer, { global: { plugins: [runtimeApiPlugin(api)] } }).text()).toBe('true')
  })
  it('fails hard without the composition owner', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const Consumer = defineComponent({ setup: () => useRuntimeApi(), template: '<span />' })
    expect(() => mount(Consumer)).toThrow('Runtime API provider is unavailable')
    warning.mockRestore()
  })
})
