import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import { experienceMetrics } from '../clients/experience-model'
import ExperienceView from './ExperienceView.vue'
it('shows missing metrics as unknown and fences late evidence on device navigation', async () => {
  const report = {
      device: 'device-01',
      window: { from: 10, until: 100 },
      evaluatedAt: 100,
      source: null,
      metrics: experienceMetrics.map((metric) => ({
        metric,
        value: null,
        state: 'unknown',
        sampleCount: 0,
        denominator: null,
        unknownCount: null,
      })),
    },
    experience = vi.fn().mockResolvedValue({ experience: report, asOf: 100 }),
    router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: ExperienceView }],
    })
  await router.push({ path: '/', query: { device: 'device-01' } })
  const wrapper = mount(ExperienceView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: { tenant: 'tenant', demo: true, security: { support: { experience } } },
      },
    },
  })
  await flushPromises()
  expect(wrapper.findAll('tbody tr').length).toBe(3)
  for (const row of wrapper.findAll('tbody tr'))
    expect(row.findAll('td')[0]!.text()).toContain('未知')
  let finish!: (v: unknown) => void
  experience.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await router.push({ path: '/', query: { device: 'device-02' } })
  await flushPromises()
  expect(wrapper.find('[data-testid="experience-report"]').exists()).toBe(false)
  experience.mockResolvedValue({ experience: { ...report, device: 'device-03' }, asOf: 100 })
  await router.push({ path: '/', query: { device: 'device-03' } })
  await flushPromises()
  finish({ experience: { ...report, device: 'device-02' }, asOf: 100 })
  await flushPromises()
  expect(wrapper.get('h2').text()).toBe('device-03')
  wrapper.unmount()
})
