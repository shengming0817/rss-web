import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestPinia, createTestRouter } from '@gocell/core/testing'
import type { Router } from 'vue-router'
import CellDetailView from './CellDetailView.vue'

// t returns the key (+ serialised params) so assertions are i18n-agnostic.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k),
  }),
}))

function makeRouter(): Router {
  return createTestRouter([
    { path: '/cells', name: 'cells', component: { template: '<div />' } },
    { path: '/cells/:id', name: 'cell-detail', component: CellDetailView },
  ])
}

async function mountAt(path: string) {
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(CellDetailView, {
    global: { plugins: [router, createTestPinia({ createSpy: vi.fn })] },
  })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CellDetailView · known cell', () => {
  it('renders the ARIA tablist with all 12 tabs', async () => {
    const { wrapper } = await mountAt('/cells/accesscore')
    expect(wrapper.find('[role="tablist"]').exists()).toBe(true)
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(12)
  })

  it('renders the cell id and durability badge in the header', async () => {
    const { wrapper } = await mountAt('/cells/accesscore')
    expect(wrapper.find('.cell-detail__id').text()).toBe('accesscore')
    // CellDurabilityBadge renders the badge label key (accesscore is durable)
    expect(wrapper.text()).toContain('cells.badge.durable')
  })

  it('defaults to the overview tab (aria-selected) when no ?tab=', async () => {
    const { wrapper } = await mountAt('/cells/accesscore')
    const overview = wrapper.get('#cell-tab-accesscore-overview')
    expect(overview.attributes('aria-selected')).toBe('true')
    const panel = wrapper.get('[role="tabpanel"]')
    expect(panel.attributes('id')).toBe('cell-panel-accesscore-overview')
    expect(panel.attributes('aria-labelledby')).toBe('cell-tab-accesscore-overview')
  })

  it('honours a valid ?tab= query', async () => {
    const { wrapper } = await mountAt('/cells/accesscore?tab=contracts')
    expect(wrapper.get('#cell-tab-accesscore-contracts').attributes('aria-selected')).toBe('true')
    expect(wrapper.get('[role="tabpanel"]').attributes('id')).toBe(
      'cell-panel-accesscore-contracts',
    )
  })

  it('falls back to overview for an unknown ?tab=', async () => {
    const { wrapper } = await mountAt('/cells/accesscore?tab=bogus')
    expect(wrapper.get('#cell-tab-accesscore-overview').attributes('aria-selected')).toBe('true')
  })

  it('selecting a tab pushes the new ?tab= via router.replace', async () => {
    const { wrapper, router } = await mountAt('/cells/accesscore')
    const replaceSpy = vi.spyOn(router, 'replace')
    await wrapper.get('#cell-tab-accesscore-inventory').trigger('click')
    expect(replaceSpy).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ tab: 'inventory' }) }),
    )
  })

  it('the tabpanel is focusable (tabindex -1)', async () => {
    const { wrapper } = await mountAt('/cells/accesscore')
    expect(wrapper.get('[role="tabpanel"]').attributes('tabindex')).toBe('-1')
  })
})

describe('CellDetailView · unknown cell', () => {
  it('renders a not-found alert with no tab chrome', async () => {
    const { wrapper } = await mountAt('/cells/does-not-exist')
    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('cells.detail.notFound')
  })

  it('not-found state offers a back link to /cells', async () => {
    const { wrapper } = await mountAt('/cells/does-not-exist')
    const back = wrapper.find('a[href="/cells"]')
    expect(back.exists()).toBe(true)
  })
})
