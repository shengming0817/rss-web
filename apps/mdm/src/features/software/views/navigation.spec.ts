import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import { defaultSchedule } from '../../policies/clients/model'
import BootstrapView from './BootstrapView.vue'
import CatalogView from './CatalogView.vue'
const first = '11111111-1111-4111-8111-111111111111',
  second = '22222222-2222-4222-8222-222222222222'
for (const screen of [
  {
    component: BootstrapView,
    query: 'id',
    test: 'onboarding-policy-locator',
    owner: 'policies',
    value: (id: string) => ({
      id,
      revision: 1,
      enabled: true,
      version: 1,
      versionId: id,
      definition: {
        scope: first,
        action: {
          kind: 'request_mdm_enrollment',
          organization: first,
          schedule: defaultSchedule(),
          runLifetimeSeconds: 1800,
        },
      },
    }),
  },
  {
    component: CatalogView,
    query: 'resource',
    test: 'resource-locator',
    owner: 'resources',
    value: (id: string) => ({
      id,
      presentation: {},
      origin: null,
      kind: 'software',
      revision: 1,
      versions: [],
    }),
  },
]) {
  it(`${screen.owner} discards late responses and clears stale data after a failed deep link`, async () => {
    const read = vi.fn(async (id: string) => screen.value(id)),
      router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/', component: screen.component }],
      })
    await router.push({ path: '/', query: { [screen.query]: first } })
    const owner = { read, list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }) }
    const wrapper = mount(screen.component, {
      global: {
        plugins: [router, mdmI18n()],
        stubs: { RouterLink: true },
        provide: {
          [mdmKey as symbol]: {
            tenant: first,
            session: { state: ref({ session: { id: first } }) },
            policies: { [screen.owner]: owner },
          },
        },
      },
    })
    await flushPromises()
    expect(wrapper.get(`[data-testid=${screen.test}]`).text()).toContain(first)
    let complete!: (value: ReturnType<typeof screen.value>) => void
    read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    await router.push({ path: '/', query: { [screen.query]: second } })
    await flushPromises()
    expect(wrapper.find(`[data-testid=${screen.test}]`).exists()).toBe(false)
    await router.push({ path: '/', query: { [screen.query]: first } })
    await flushPromises()
    complete(screen.value(second))
    await flushPromises()
    expect(wrapper.get(`[data-testid=${screen.test}]`).text()).toContain(first)
    read.mockRejectedValueOnce(new Error('unavailable'))
    await router.push({ path: '/', query: { [screen.query]: second } })
    await flushPromises()
    expect(wrapper.find(`[data-testid=${screen.test}]`).exists()).toBe(false)
    wrapper.unmount()
  })
}
