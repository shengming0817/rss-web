import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createWebI18n } from '../../i18n'
import { auditApiPlugin } from './audit-context'
import { networkErrorForTest } from '@rss/api/testing'
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
      plugins: [createWebI18n(), auditApiPlugin({ listEntries, listTenantEntries: vi.fn() })],
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
    expect(wrapper.text()).toContain('不透明指纹')
    expect(wrapper.text()).toContain('浏览器未验证')
    expect(wrapper.get('time').attributes('datetime')).toBe('1970-01-01T00:00:01.000Z')
    expect(wrapper.text()).not.toContain('<redacted>')
    expect(wrapper.get('[data-source="rss"]')).toBeTruthy()
  })

  it('degrades without stale rows or automatic retry', async () => {
    const listEntries = vi
      .fn()
      .mockRejectedValueOnce(networkErrorForTest())
      .mockResolvedValueOnce(page)
    const wrapper = mountEntries(listEntries)
    await flushPromises()
    expect(wrapper.get('[data-source="unavailable"]')).toBeTruthy()
    expect(wrapper.text()).not.toContain('sensitive raw response')
    expect(wrapper.text()).not.toContain('opaque')
    expect(wrapper.get('section.home-panel > header h2')).toBeTruthy()
    expect(wrapper.get('section.error-page h3')).toBeTruthy()
    expect(listEntries).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-action="recover"]').exists()).toBe(true)
    await wrapper.get('[data-action="recover"]').trigger('click')
    await flushPromises()
    expect(listEntries).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('opaque')
  })

  it('aborts the active read when the panel unmounts', async () => {
    let capturedSignal: AbortSignal | undefined
    const listEntries = vi.fn(({ signal }: { signal?: AbortSignal } = {}) => {
      capturedSignal = signal
      return new Promise<typeof page>(() => undefined)
    })
    const wrapper = mountEntries(listEntries)
    await flushPromises()
    expect(capturedSignal?.aborted).toBe(false)
    wrapper.unmount()
    expect(capturedSignal?.aborted).toBe(true)
  })

  it('offers an explicit refresh that re-reads the first server-ordered page', async () => {
    const refreshed = {
      ...page,
      data: [{ ...page.data[0], seq: 1, entryHash: 'refreshed-opaque' }],
    }
    const listEntries = vi.fn().mockResolvedValueOnce(page).mockResolvedValueOnce(refreshed)
    const wrapper = mountEntries(listEntries)
    await flushPromises()

    await wrapper.get('[data-action="refresh-audit"]').trigger('click')
    await flushPromises()

    expect(listEntries).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('refreshed-opaque')
  })

  it('keeps the reviewed button and keyboard focus while refresh is pending', async () => {
    let resolveRefresh: ((value: typeof page) => void) | undefined
    const listEntries = vi
      .fn()
      .mockResolvedValueOnce(page)
      .mockImplementationOnce(
        () => new Promise<typeof page>((resolve) => (resolveRefresh = resolve)),
      )
    const wrapper = mountEntries(listEntries)
    document.body.append(wrapper.element)
    await flushPromises()

    const button = wrapper.get<HTMLButtonElement>('[data-action="refresh-audit"]')
    button.element.focus()
    await button.trigger('click')

    expect(button.classes()).toContain('v1-btn')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-busy')).toBe('true')
    expect(document.activeElement).toBe(button.element)
    resolveRefresh?.(page)
    await flushPromises()
    expect(button.attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
})
