import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DepsViewBar from './DepsViewBar.vue'
import type { DepsViewId } from './DepsViewBar.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}))

const VIEWS: readonly { id: DepsViewId; labelKey: string }[] = [
  { id: 'list', labelKey: 'deps.view.list' },
  { id: 'graph', labelKey: 'deps.view.graph' },
  { id: 'tree', labelKey: 'deps.view.tree' },
  { id: 'matrix', labelKey: 'deps.view.matrix' },
] as const

describe('DepsViewBar', () => {
  it('renders a tablist with role=tablist', () => {
    const wrapper = mount(DepsViewBar, {
      props: { views: VIEWS, activeId: 'list' },
    })
    expect(wrapper.find('[role="tablist"]').exists()).toBe(true)
  })

  it('renders 4 buttons with role=tab', () => {
    const wrapper = mount(DepsViewBar, {
      props: { views: VIEWS, activeId: 'list' },
    })
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(4)
  })

  it('tablist has aria-label from i18n key', () => {
    const wrapper = mount(DepsViewBar, {
      props: { views: VIEWS, activeId: 'list' },
    })
    expect(wrapper.find('[role="tablist"]').attributes('aria-label')).toBe('deps.viewsLabel')
  })

  it('active tab has aria-selected=true and tabindex=0', () => {
    const wrapper = mount(DepsViewBar, {
      props: { views: VIEWS, activeId: 'graph' },
    })
    const active = wrapper.find('[aria-selected="true"]')
    expect(active.exists()).toBe(true)
    expect(active.attributes('tabindex')).toBe('0')
    expect(active.attributes('id')).toBe('deps-tab-graph')
  })

  it('inactive tabs have aria-selected=false and tabindex=-1', () => {
    const wrapper = mount(DepsViewBar, {
      props: { views: VIEWS, activeId: 'list' },
    })
    const inactive = wrapper.findAll('[aria-selected="false"]')
    expect(inactive).toHaveLength(3)
    for (const btn of inactive) {
      expect(btn.attributes('tabindex')).toBe('-1')
    }
  })

  it('active tab has aria-controls pointing to its panel id', () => {
    const wrapper = mount(DepsViewBar, {
      props: { views: VIEWS, activeId: 'tree' },
    })
    const active = wrapper.find('[aria-selected="true"]')
    expect(active.attributes('aria-controls')).toBe('deps-panel-tree')
  })

  it('all tabs have aria-controls pointing to their panel id', () => {
    const wrapper = mount(DepsViewBar, {
      props: { views: VIEWS, activeId: 'list' },
    })
    for (const view of VIEWS) {
      const btn = wrapper.find(`#deps-tab-${view.id}`)
      expect(btn.attributes('aria-controls')).toBe(`deps-panel-${view.id}`)
    }
  })

  it('click emits select with the view id', async () => {
    const wrapper = mount(DepsViewBar, {
      props: { views: VIEWS, activeId: 'list' },
    })
    const graphBtn = wrapper.find('#deps-tab-graph')
    await graphBtn.trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')?.[0]).toEqual(['graph'])
  })

  it('ArrowRight keydown moves focus to next tab and emits select', async () => {
    const wrapper = mount(DepsViewBar, {
      props: { views: VIEWS, activeId: 'list' },
      attachTo: document.body,
    })
    const listBtn = wrapper.find('#deps-tab-list')
    const graphBtn = wrapper.find('#deps-tab-graph')
    const focusSpy = vi.spyOn(graphBtn.element as HTMLElement, 'focus')
    await listBtn.trigger('keydown', { key: 'ArrowRight' })
    expect(focusSpy).toHaveBeenCalled()
    expect(wrapper.emitted('select')?.[0]).toEqual(['graph'])
    wrapper.unmount()
  })

  it('ArrowLeft keydown emits select with the previous tab id', async () => {
    const wrapper = mount(DepsViewBar, {
      props: { views: VIEWS, activeId: 'graph' },
      attachTo: document.body,
    })
    const graphBtn = wrapper.find('#deps-tab-graph')
    await graphBtn.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('select')?.[0]).toEqual(['list'])
    wrapper.unmount()
  })

  it('ArrowRight wraps around from last to first tab', async () => {
    const wrapper = mount(DepsViewBar, {
      props: { views: VIEWS, activeId: 'matrix' },
      attachTo: document.body,
    })
    const matrixBtn = wrapper.find('#deps-tab-matrix')
    await matrixBtn.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('select')?.[0]).toEqual(['list'])
    wrapper.unmount()
  })

  it('button text is the labelKey via t()', () => {
    const wrapper = mount(DepsViewBar, {
      props: { views: VIEWS, activeId: 'list' },
    })
    const firstBtn = wrapper.findAll('[role="tab"]')[0]
    expect(firstBtn?.text()).toBe('deps.view.list')
  })
})
