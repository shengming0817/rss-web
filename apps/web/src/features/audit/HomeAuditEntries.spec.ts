import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createWebI18n } from '../../i18n'
import { adminClientsPlugin } from '../admin/admin-context'
import HomeAuditEntries from './HomeAuditEntries.vue'

const page = {
  data: [
    {
      seq: 0,
      tenantId: '<redacted>',
      actor: '<redacted>',
      actorKind: 'user',
      action: 'login',
      resourceKind: 'session',
      resourceId: '<redacted>',
      outcome: 'success',
      recordedAt: 1,
      entryHash: 'opaque',
    },
  ],
  hasMore: true,
  nextCursor: 'next',
}

function mountEntries(listEntries: () => Promise<typeof page>) {
  return mount(HomeAuditEntries, {
    global: {
      plugins: [
        createWebI18n(),
        adminClientsPlugin({
          audit: { listEntries },
          runtime: {
            inventory: async () => {
              throw new Error('unused')
            },
          },
        }),
      ],
    },
  })
}

describe('HomeAuditEntries', () => {
  it('labels the server first page honestly and keeps PII out of the summary', async () => {
    const wrapper = mountEntries(async () => page)
    await flushPromises()
    expect(wrapper.text()).toContain('首批审计条目')
    expect(wrapper.text()).toContain('不是“最新”')
    expect(wrapper.text()).toContain('opaque')
    expect(wrapper.text()).not.toContain('<redacted>')
    expect(wrapper.get('[data-source="rss"]')).toBeTruthy()
  })

  it('degrades without stale rows or automatic retry', async () => {
    const listEntries = vi.fn().mockRejectedValue(new Error('sensitive raw response'))
    const wrapper = mountEntries(listEntries)
    await flushPromises()
    expect(wrapper.get('[data-source="unavailable"]')).toBeTruthy()
    expect(wrapper.text()).not.toContain('sensitive raw response')
    expect(wrapper.text()).not.toContain('opaque')
    expect(listEntries).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-action="recover"]').exists()).toBe(false)
  })
})
