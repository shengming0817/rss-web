import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ObserveTabBar from './ObserveTabBar.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@gocell/core', () => ({
  useRovingTablist: ({
    onActivate,
    disabledIds,
  }: {
    tabIds: () => readonly string[]
    idFor: (id: string) => string
    onActivate?: (id: string) => void
    disabledIds?: readonly string[]
  }) => ({
    onKeydown: (_e: KeyboardEvent, id: string) => {
      const isDisabled = disabledIds !== undefined && disabledIds.includes(id)
      if (!isDisabled) onActivate?.(id)
    },
  }),
}))

function mountBar(activeId = 'overview') {
  return mount(ObserveTabBar, {
    props: { activeId },
  })
}

describe('ObserveTabBar · structure', () => {
  it('renders a tablist with aria-label', () => {
    const wrapper = mountBar()
    const tablist = wrapper.find('[role="tablist"]')
    expect(tablist.exists()).toBe(true)
    expect(tablist.attributes('aria-label')).toBe('observe.tablistLabel')
  })

  it('renders exactly 3 enabled tab buttons', () => {
    const wrapper = mountBar()
    const tabs = wrapper.findAll('button[role="tab"]:not([aria-disabled])')
    expect(tabs).toHaveLength(3)
  })

  it('renders exactly 4 wave-2 disabled tab buttons', () => {
    const wrapper = mountBar()
    const wave2 = wrapper.findAll('button[aria-disabled="true"]')
    expect(wave2).toHaveLength(4)
  })

  it('wave-2 buttons have aria-disabled="true"', () => {
    const wrapper = mountBar()
    const wave2 = wrapper.findAll('button[aria-disabled="true"]')
    wave2.forEach((btn) => {
      expect(btn.attributes('aria-disabled')).toBe('true')
    })
  })

  it('wave-2 buttons have tabindex="-1"', () => {
    const wrapper = mountBar()
    const wave2 = wrapper.findAll('button[aria-disabled="true"]')
    wave2.forEach((btn) => {
      expect(btn.attributes('tabindex')).toBe('-1')
    })
  })

  it('wave-2 items are buttons with role=tab (not spans), enabling roving focus', () => {
    const wrapper = mountBar()
    const wave2 = wrapper.findAll('button[role="tab"][aria-disabled="true"]')
    expect(wave2.length).toBe(4)
  })
})

describe('ObserveTabBar · active state', () => {
  it('active tab has aria-selected="true"', () => {
    const wrapper = mountBar('overview')
    const tabs = wrapper.findAll('button[role="tab"]')
    const overviewTab = tabs.find((t) => t.text().includes('observe.tabs.overview'))
    expect(overviewTab?.attributes('aria-selected')).toBe('true')
  })

  it('active tab has tabindex="0"', () => {
    const wrapper = mountBar('overview')
    const tabs = wrapper.findAll('button[role="tab"]')
    const overviewTab = tabs.find((t) => t.text().includes('observe.tabs.overview'))
    expect(overviewTab?.attributes('tabindex')).toBe('0')
  })

  it('inactive tabs have tabindex="-1"', () => {
    const wrapper = mountBar('overview')
    const tabs = wrapper.findAll('button[role="tab"]')
    const otherTabs = tabs.filter((t) => !t.text().includes('observe.tabs.overview'))
    otherTabs.forEach((tab) => {
      expect(tab.attributes('tabindex')).toBe('-1')
    })
  })

  it('active tab has aria-controls set', () => {
    const wrapper = mountBar('logs')
    const tabs = wrapper.findAll('button[role="tab"]')
    const logsTab = tabs.find((t) => t.text().includes('observe.tabs.logs'))
    expect(logsTab?.attributes('aria-controls')).toBeTruthy()
  })

  it('inactive tabs do not have aria-controls', () => {
    const wrapper = mountBar('overview')
    const tabs = wrapper.findAll('button[role="tab"]')
    const inactiveTabs = tabs.filter((t) => !t.text().includes('observe.tabs.overview'))
    inactiveTabs.forEach((tab) => {
      expect(tab.attributes('aria-controls')).toBeUndefined()
    })
  })
})

describe('ObserveTabBar · interactions', () => {
  it('clicking an enabled tab emits select with the tab id', async () => {
    const wrapper = mountBar('overview')
    const tabs = wrapper.findAll('button[role="tab"]:not([aria-disabled])')
    const logsTab = tabs.find((t) => t.text().includes('observe.tabs.logs'))
    await logsTab?.trigger('click')
    const emitted = wrapper.emitted('select')
    expect(emitted).toBeTruthy()
    expect(emitted?.[0]).toEqual(['logs'])
  })

  it('clicking the traces tab emits select with "traces"', async () => {
    const wrapper = mountBar('overview')
    const tabs = wrapper.findAll('button[role="tab"]:not([aria-disabled])')
    const tracesTab = tabs.find((t) => t.text().includes('observe.tabs.traces'))
    await tracesTab?.trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['traces'])
  })

  it('wave-2 buttons do not emit select when keydown fires (disabledIds suppresses activation)', async () => {
    const wrapper = mountBar('overview')
    const wave2 = wrapper.findAll('button[aria-disabled="true"]')
    // trigger keydown on first wave-2 button (simulates roving reaching it)
    await wave2[0]?.trigger('keydown', { key: 'ArrowRight' })
    // Our mock stub respects disabledIds, so select should NOT have been emitted
    // for the disabled tab id itself; it may not have emitted at all
    const emitted = wrapper.emitted('select')
    // If emitted, verify none of them are Wave-2 ids
    const wave2Ids = ['anomalies', 'whatChanged', 'serviceGraph', 'sliceHealth']
    if (emitted) {
      for (const call of emitted) {
        expect(wave2Ids).not.toContain(call[0])
      }
    }
  })
})
