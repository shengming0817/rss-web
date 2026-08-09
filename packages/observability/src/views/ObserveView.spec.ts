import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createTestRouter } from '@gocell/core/testing'
import type { Router } from 'vue-router'
import ObserveView from './ObserveView.vue'

// ─── module mocks ─────────────────────────────────────────────────────────────

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k),
  }),
}))

// Stub all 5 child components so the view spec focuses on routing/tab logic.
vi.mock('../components/ObserveTabBar.vue', () => ({
  default: {
    name: 'ObserveTabBar',
    props: ['activeId'],
    emits: ['select'],
    template: `
      <div
        data-testid="observe-tab-bar"
        :data-active-id="activeId"
      >
        <button type="button" @click="$emit('select', 'overview')">overview</button>
        <button type="button" @click="$emit('select', 'logs')">logs</button>
        <button type="button" @click="$emit('select', 'traces')">traces</button>
      </div>
    `,
  },
}))

vi.mock('../components/ObservabilityErrorBoundary.vue', () => ({
  default: {
    name: 'ObservabilityErrorBoundary',
    template: '<div data-testid="error-boundary"><slot /></div>',
  },
}))

vi.mock('../components/OverviewPanel.vue', () => ({
  default: {
    name: 'OverviewPanel',
    template: '<div data-testid="overview-panel" />',
  },
}))

vi.mock('../components/LogsPanel.vue', () => ({
  default: {
    name: 'LogsPanel',
    template: '<div data-testid="logs-panel" />',
  },
}))

vi.mock('../components/TracesPanel.vue', () => ({
  default: {
    name: 'TracesPanel',
    template: '<div data-testid="traces-panel" />',
  },
}))

// ─── helpers ──────────────────────────────────────────────────────────────────

async function mountAt(path: string) {
  const router: Router = createTestRouter([
    { path: '/observe', name: 'observe', component: ObserveView },
  ])
  await router.push(path)
  await router.isReady()

  const wrapper = mount(ObserveView, {
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn }), router],
      // Provide synchronous stubs for the panel components so vue-test-utils
      // doesn't have to deal with the defineAsyncComponent wrapper. This
      // correctly represents panels (only the active one is in the DOM since
      // ObserveView uses v-if via <component :is="activePanel">).
      stubs: {
        OverviewPanel: { name: 'OverviewPanel', template: '<div data-testid="overview-panel" />' },
        LogsPanel: { name: 'LogsPanel', template: '<div data-testid="logs-panel" />' },
        TracesPanel: { name: 'TracesPanel', template: '<div data-testid="traces-panel" />' },
      },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('ObserveView · page structure', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders h1 with observe.title key', async () => {
    const { wrapper } = await mountAt('/observe')
    expect(wrapper.find('h1').text()).toContain('observe.title')
  })

  it('h1 carries the v1-h1 class', async () => {
    const { wrapper } = await mountAt('/observe')
    expect(wrapper.find('h1').classes()).toContain('v1-h1')
  })

  it('renders the subtitle with observe.subtitle key', async () => {
    const { wrapper } = await mountAt('/observe')
    expect(wrapper.find('p.v1-sub').text()).toContain('observe.subtitle')
  })

  it('renders ObserveTabBar stub', async () => {
    const { wrapper } = await mountAt('/observe')
    expect(wrapper.find('[data-testid="observe-tab-bar"]').exists()).toBe(true)
  })

  it('wraps the active panel in the error boundary', async () => {
    const { wrapper } = await mountAt('/observe')
    expect(wrapper.find('[data-testid="error-boundary"]').exists()).toBe(true)
  })
})

describe('ObserveView · default tab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('defaults to overview panel when no ?tab= query', async () => {
    const { wrapper } = await mountAt('/observe')
    expect(wrapper.find('[data-testid="overview-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="logs-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="traces-panel"]').exists()).toBe(false)
  })

  it('tabpanel has role="tabpanel"', async () => {
    const { wrapper } = await mountAt('/observe')
    expect(wrapper.find('[role="tabpanel"]').exists()).toBe(true)
  })

  it('tabpanel id matches observe-panel-overview', async () => {
    const { wrapper } = await mountAt('/observe')
    expect(wrapper.find('[role="tabpanel"]').attributes('id')).toBe('observe-panel-overview')
  })

  it('tabpanel aria-labelledby points to the active tab button id', async () => {
    const { wrapper } = await mountAt('/observe')
    expect(wrapper.find('[role="tabpanel"]').attributes('aria-labelledby')).toBe(
      'observe-tab-overview',
    )
  })
})

describe('ObserveView · ?tab= query param', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders LogsPanel when ?tab=logs', async () => {
    const { wrapper } = await mountAt('/observe?tab=logs')
    expect(wrapper.find('[data-testid="logs-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="overview-panel"]').exists()).toBe(false)
  })

  it('renders TracesPanel when ?tab=traces', async () => {
    const { wrapper } = await mountAt('/observe?tab=traces')
    expect(wrapper.find('[data-testid="traces-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="overview-panel"]').exists()).toBe(false)
  })

  it('falls back to OverviewPanel for an unknown ?tab=', async () => {
    const { wrapper } = await mountAt('/observe?tab=bogus')
    expect(wrapper.find('[data-testid="overview-panel"]').exists()).toBe(true)
  })

  it('tabpanel id and aria-labelledby match the active tab when ?tab=traces', async () => {
    const { wrapper } = await mountAt('/observe?tab=traces')
    const panel = wrapper.find('[role="tabpanel"]')
    expect(panel.attributes('id')).toBe('observe-panel-traces')
    expect(panel.attributes('aria-labelledby')).toBe('observe-tab-traces')
  })
})

describe('ObserveView · tab select', () => {
  beforeEach(() => vi.clearAllMocks())

  it('emitting select("logs") from ObserveTabBar calls router.replace with tab=logs', async () => {
    const { wrapper, router } = await mountAt('/observe')
    const replaceSpy = vi.spyOn(router, 'replace')

    // Simulate the ObserveTabBar stub emitting select('logs') via the logs button
    const tabBar = wrapper.find('[data-testid="observe-tab-bar"]')
    const logsBtn = tabBar.findAll('button')[1]
    if (logsBtn) {
      await logsBtn.trigger('click')
      await flushPromises()
    }

    expect(replaceSpy).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ tab: 'logs' }) }),
    )
  })

  it('after selecting logs tab, LogsPanel is rendered', async () => {
    const { wrapper } = await mountAt('/observe')
    const tabBar = wrapper.find('[data-testid="observe-tab-bar"]')
    const logsBtn = tabBar.findAll('button')[1]
    if (logsBtn) {
      await logsBtn.trigger('click')
      await flushPromises()
    }
    expect(wrapper.find('[data-testid="logs-panel"]').exists()).toBe(true)
  })

  it('clicking current active tab does not call router.replace', async () => {
    const { wrapper, router } = await mountAt('/observe')
    const replaceSpy = vi.spyOn(router, 'replace')
    // First button in tab bar stub emits 'overview' — already active
    const tabBar = wrapper.find('[data-testid="observe-tab-bar"]')
    const overviewBtn = tabBar.findAll('button')[0]
    if (overviewBtn) {
      await overviewBtn.trigger('click')
      await flushPromises()
    }
    expect(replaceSpy).not.toHaveBeenCalled()
  })
})
