import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { adminClientsPlugin, useAdminClients } from './admin-context'

describe('Admin clients context', () => {
  it('provides the exact two injected clients', () => {
    const clients = {
      audit: { listEntries: async () => ({ data: [], hasMore: false }) },
      runtime: {
        inventory: async () => {
          throw new Error('unused')
        },
      },
    }
    const Consumer = defineComponent({
      setup: () => ({ same: useAdminClients() === clients }),
      template: '<span>{{ same }}</span>',
    })
    expect(mount(Consumer, { global: { plugins: [adminClientsPlugin(clients)] } }).text()).toBe(
      'true',
    )
  })

  it('fails hard without the composition owner', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const Consumer = defineComponent({ setup: () => useAdminClients(), template: '<span />' })
    expect(() => mount(Consumer)).toThrow('Admin clients provider is unavailable')
    warning.mockRestore()
  })
})
