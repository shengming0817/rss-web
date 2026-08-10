import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createWebI18n } from '../i18n'
import ErrorView from './ErrorView.vue'

describe('ErrorView', () => {
  it('renders the closed 404 and returns to the named Home route', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: { template: '<div />' } },
        { path: '/missing', component: ErrorView },
      ],
    })
    await router.push('/missing')
    await router.isReady()
    const wrapper = mount(ErrorView, { global: { plugins: [router, createWebI18n()] } })
    expect(wrapper.text()).toContain('WEB_NOT_FOUND')
    await wrapper.get('[data-action="recover"]').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('home'))
  })
})
