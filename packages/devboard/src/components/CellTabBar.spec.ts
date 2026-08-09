import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CellTabBar from './CellTabBar.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}))

const TABS = [
  { id: 'overview', labelKey: 'cells.tabs.overview' },
  { id: 'interfaces', labelKey: 'cells.tabs.interfaces' },
  { id: 'wiring', labelKey: 'cells.tabs.wiring' },
] as const

describe('CellTabBar', () => {
  it('renders one button per tab with role=tab', () => {
    const wrapper = mount(CellTabBar, {
      props: { tabs: TABS, activeId: 'overview', cellId: 'accesscore' },
    })
    const buttons = wrapper.findAll('[role="tab"]')
    expect(buttons).toHaveLength(3)
  })

  it('active tab has aria-selected=true and tabindex=0', () => {
    const wrapper = mount(CellTabBar, {
      props: { tabs: TABS, activeId: 'interfaces', cellId: 'accesscore' },
    })
    const active = wrapper.find('[aria-selected="true"]')
    expect(active.exists()).toBe(true)
    expect(active.attributes('tabindex')).toBe('0')
  })

  it('inactive tabs have aria-selected=false and tabindex=-1', () => {
    const wrapper = mount(CellTabBar, {
      props: { tabs: TABS, activeId: 'overview', cellId: 'accesscore' },
    })
    const inactive = wrapper.findAll('[aria-selected="false"]')
    expect(inactive).toHaveLength(2)
    for (const btn of inactive) {
      expect(btn.attributes('tabindex')).toBe('-1')
    }
  })

  it('active tab has aria-controls matching panelId helper', () => {
    const wrapper = mount(CellTabBar, {
      props: { tabs: TABS, activeId: 'overview', cellId: 'mycel' },
    })
    const activeBtn = wrapper.find('[aria-selected="true"]')
    expect(activeBtn.attributes('aria-controls')).toBe('cell-panel-mycel-overview')
  })

  it('inactive tabs have no aria-controls attribute', () => {
    const wrapper = mount(CellTabBar, {
      props: { tabs: TABS, activeId: 'overview', cellId: 'mycel' },
    })
    const inactiveBtns = wrapper.findAll('[aria-selected="false"]')
    for (const btn of inactiveBtns) {
      expect(btn.attributes('aria-controls')).toBeUndefined()
    }
  })

  it('tab button id matches tabBtnId helper', () => {
    const wrapper = mount(CellTabBar, {
      props: { tabs: TABS, activeId: 'overview', cellId: 'mycel' },
    })
    const firstBtn = wrapper.findAll('[role="tab"]')[0]
    expect(firstBtn?.attributes('id')).toBe('cell-tab-mycel-overview')
  })

  it('click emits select with the tab id', async () => {
    const wrapper = mount(CellTabBar, {
      props: { tabs: TABS, activeId: 'overview', cellId: 'accesscore' },
    })
    const secondBtn = wrapper.findAll('[role="tab"]')[1]
    await secondBtn?.trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')?.[0]).toEqual(['interfaces'])
  })

  it('tablist has role=tablist', () => {
    const wrapper = mount(CellTabBar, {
      props: { tabs: TABS, activeId: 'overview', cellId: 'accesscore' },
    })
    expect(wrapper.find('[role="tablist"]').exists()).toBe(true)
  })

  it('tablist has aria-label from i18n key', () => {
    const wrapper = mount(CellTabBar, {
      props: { tabs: TABS, activeId: 'overview', cellId: 'accesscore' },
    })
    const tablist = wrapper.find('[role="tablist"]')
    // i18n mock returns the key itself
    expect(tablist.attributes('aria-label')).toBe('cells.detail.tablistLabel')
  })

  it('button text is the labelKey (via t())', () => {
    const wrapper = mount(CellTabBar, {
      props: { tabs: TABS, activeId: 'overview', cellId: 'accesscore' },
    })
    const firstBtn = wrapper.findAll('[role="tab"]')[0]
    expect(firstBtn?.text()).toBe('cells.tabs.overview')
  })

  it('ArrowRight keydown moves focus to next tab button', async () => {
    // Mount with jsdom — getElementById needs to exist in DOM
    const wrapper = mount(CellTabBar, {
      props: { tabs: TABS, activeId: 'overview', cellId: 'kc' },
      attachTo: document.body,
    })
    const firstBtn = wrapper.find('#cell-tab-kc-overview')
    const secondBtn = wrapper.find('#cell-tab-kc-interfaces')
    const focusSpy = vi.spyOn(secondBtn.element as HTMLElement, 'focus')
    await firstBtn.trigger('keydown', { key: 'ArrowRight' })
    expect(focusSpy).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ArrowRight keydown emits select with the adjacent tab id (automatic activation)', async () => {
    const wrapper = mount(CellTabBar, {
      props: { tabs: TABS, activeId: 'overview', cellId: 'kc' },
      attachTo: document.body,
    })
    const firstBtn = wrapper.find('#cell-tab-kc-overview')
    await firstBtn.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')?.[0]).toEqual(['interfaces'])
    wrapper.unmount()
  })

  it('ArrowLeft keydown emits select with the adjacent tab id (automatic activation)', async () => {
    const wrapper = mount(CellTabBar, {
      props: { tabs: TABS, activeId: 'interfaces', cellId: 'kc' },
      attachTo: document.body,
    })
    const secondBtn = wrapper.find('#cell-tab-kc-interfaces')
    await secondBtn.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')?.[0]).toEqual(['overview'])
    wrapper.unmount()
  })
})
