import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { auditApiPlugin, useAuditApi } from './audit-context'

describe('Audit API context', () => {
  it('provides only the audit capability', () => {
    const api = { listEntries: vi.fn() }
    const Consumer = defineComponent({
      setup: () => ({ same: useAuditApi() === api }),
      template: '<span>{{ same }}</span>',
    })
    expect(mount(Consumer, { global: { plugins: [auditApiPlugin(api)] } }).text()).toBe('true')
  })
  it('fails hard without the composition owner', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const Consumer = defineComponent({ setup: () => useAuditApi(), template: '<span />' })
    expect(() => mount(Consumer)).toThrow('Audit API provider is unavailable')
    warning.mockRestore()
  })
})
