import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import AIBottomBar from './AIBottomBar.vue'
import zhCN from '../i18n/messages/zh-CN'
import enUS from '../i18n/messages/en-US'

function makeI18n() {
  return createI18n({
    legacy: false,
    locale: 'zh-CN',
    fallbackLocale: 'zh-CN',
    messages: { 'zh-CN': zhCN, 'en-US': enUS },
    missingWarn: false,
    fallbackWarn: false,
  })
}

function mountBar() {
  return mount(AIBottomBar, {
    global: { plugins: [makeI18n()] },
    attachTo: document.body,
  })
}

describe('AIBottomBar.vue', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  describe('initial state (collapsed)', () => {
    it('renders the bar', () => {
      const wrapper = mountBar()
      expect(wrapper.find('.ai-bar').exists()).toBe(true)
    })

    it('renders the strip area', () => {
      const wrapper = mountBar()
      expect(wrapper.find('.ai-bar__strip').exists()).toBe(true)
    })

    it('renders the trigger button', () => {
      const wrapper = mountBar()
      expect(wrapper.find('.ai-bar__trigger').exists()).toBe(true)
    })

    it('has role="complementary"', () => {
      const wrapper = mountBar()
      expect(wrapper.find('[role="complementary"]').exists()).toBe(true)
    })

    it('has aria-label', () => {
      const wrapper = mountBar()
      const bar = wrapper.find('.ai-bar')
      expect(bar.attributes('aria-label')).toBeTruthy()
    })

    it('does not show the panel initially', () => {
      const wrapper = mountBar()
      expect(wrapper.find('.ai-bar__panel').exists()).toBe(false)
    })
  })

  describe('expand behavior', () => {
    it('shows panel after clicking expand button', async () => {
      const wrapper = mountBar()
      await wrapper.find('.ai-bar__trigger').trigger('click')
      expect(wrapper.find('.ai-bar__panel').exists()).toBe(true)
    })

    it('applies ai-bar--docked class when docked', async () => {
      const wrapper = mountBar()
      await wrapper.find('.ai-bar__trigger').trigger('click')
      expect(wrapper.find('.ai-bar').classes()).toContain('ai-bar--docked')
    })

    it('shows collapse button after expanding', async () => {
      const wrapper = mountBar()
      await wrapper.find('.ai-bar__trigger').trigger('click')
      // Now a collapse button is shown (different aria-label)
      const btn = wrapper.find('.ai-bar__trigger')
      expect(btn.exists()).toBe(true)
    })
  })

  describe('collapse behavior', () => {
    it('hides panel after collapse button clicked', async () => {
      const wrapper = mountBar()

      // Expand first
      await wrapper.find('.ai-bar__trigger').trigger('click')
      expect(wrapper.find('.ai-bar__panel').exists()).toBe(true)

      // Collapse
      await wrapper.find('.ai-bar__trigger').trigger('click')
      expect(wrapper.find('.ai-bar__panel').exists()).toBe(false)
    })

    it('removes ai-bar--docked class when collapsed', async () => {
      const wrapper = mountBar()

      await wrapper.find('.ai-bar__trigger').trigger('click')
      expect(wrapper.find('.ai-bar').classes()).toContain('ai-bar--docked')

      await wrapper.find('.ai-bar__trigger').trigger('click')
      expect(wrapper.find('.ai-bar').classes()).not.toContain('ai-bar--docked')
    })
  })

  describe('label', () => {
    it('shows AI label text', () => {
      const wrapper = mountBar()
      expect(wrapper.find('.ai-bar__label').text()).toBe('AI')
    })
  })

  describe('toggle multiple times', () => {
    it('toggles between collapsed and docked repeatedly', async () => {
      const wrapper = mountBar()

      // First expand
      await wrapper.find('.ai-bar__trigger').trigger('click')
      expect(wrapper.find('.ai-bar__panel').exists()).toBe(true)

      // Collapse
      await wrapper.find('.ai-bar__trigger').trigger('click')
      expect(wrapper.find('.ai-bar__panel').exists()).toBe(false)

      // Expand again
      await wrapper.find('.ai-bar__trigger').trigger('click')
      expect(wrapper.find('.ai-bar__panel').exists()).toBe(true)
    })

    it('panel shows placeholder text when docked', async () => {
      const wrapper = mountBar()
      await wrapper.find('.ai-bar__trigger').trigger('click')
      const placeholder = wrapper.find('.ai-bar__placeholder')
      expect(placeholder.exists()).toBe(true)
      expect(placeholder.text()).toBeTruthy()
    })
  })
})
