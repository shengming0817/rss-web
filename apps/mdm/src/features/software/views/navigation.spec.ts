import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import UpdatesView from './UpdatesView.vue'
import BootstrapView from './BootstrapView.vue'
import DeploymentsView from './DeploymentsView.vue'
import CatalogView from './CatalogView.vue'
const first = '11111111-1111-4111-8111-111111111111',
  second = '22222222-2222-4222-8222-222222222222'
const schedule = {
  trigger: { kind: 'check_in', minimumSeconds: 60 },
  misfire: { kind: 'coalesce_one' },
  notBefore: 0,
  until: null,
  jitterSeconds: 0,
  window: null,
}
const screens = [
  {
    component: UpdatesView,
    module: 'updates',
    query: 'id',
    field: '#update-title',
    refresh: '[data-action="read-ring"]',
    write: '[data-action="update-pause"]',
    value: (id: string) => ({
      id,
      revision: 1,
      operation: id,
      definition: {
        title: id,
        scope: first,
        platform: 'windows',
        enabled: true,
        target: { kind: 'os', release: 'demo-windows-quality-1' },
        deferDays: 0,
        deadline: 2000000000,
        notifyMinutes: 0,
        reboot: 'user',
        window: null,
      },
      scopeRevision: 1,
      devices: [],
      policy: null,
    }),
  },
  {
    component: BootstrapView,
    module: 'bootstrap',
    query: 'id',
    field: '#bootstrap-title',
    refresh: '[data-action="read-source-policy"]',
    write: '[data-action="source-pause"]',
    value: (id: string) => ({
      id,
      revision: 1,
      operation: id,
      definition: {
        title: id,
        scope: first,
        platform: 'windows',
        enabled: true,
        action: { kind: 'request_mdm', instructions: 'Contact support' },
      },
      scopeRevision: 1,
      targets: [],
    }),
  },
  {
    component: DeploymentsView,
    module: 'assignments',
    query: 'id',
    field: '#deployment-resource',
    refresh: '[data-action="read-policy"]',
    write: '[data-action="toggle-policy"]',
    value: (id: string) => ({
      id,
      revision: 1,
      version: 1,
      versionId: id,
      enabled: true,
      definition: {
        scope: first,
        action: {
          delivery: { kind: 'direct' },
          resource: { kind: 'software', id, version: '1', variants: { windows_x86_64: 'main' } },

          kind: 'software',
          intent: 'required_install',
          admissionOperation: first,
          schedule,
          runLifetimeSeconds: 60,
          rollout: { stages: [{ scope: first, opensAt: 0, minimumVerifiedPercent: null }] },
        },
      },
    }),
  },
  {
    component: CatalogView,
    module: 'catalog',
    query: 'resource',
    field: '#catalog-title',
    refresh: '',
    write: '',
    value: (id: string) => ({
      resource: { id, kind: 'software', revision: 1, versions: [] },
      metadata: {
        revision: 0,
        operation: null,
        definition: {
          title: id,
          description: '',
          category: '',
          license: { kind: 'unknown', seats: null, expiresAt: null },
          supersedes: [],
        },
      },
      usage: {
        asOf: null,
        windowDays: 30,
        sampledDevices: 0,
        totalDevices: 0,
        activeDevices: null,
        unknownDevices: 0,
        source: 'unavailable',
      },
    }),
  },
]
for (const screen of screens) {
  async function setup() {
    const read = vi.fn(async (id: string) => screen.value(id))
    const change = vi.fn(async (id: string) => screen.value(id))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: screen.component }],
    })
    await router.push({ path: '/', query: { [screen.query]: first } })
    const wrapper = mount(screen.component, {
      global: {
        plugins: [router, mdmI18n()],
        stubs: { RouterLink: true },
        provide: {
          [mdmKey as symbol]: {
            tenant: first,
            session: {
              state: ref({
                status: 'authenticated',
                tenant: first,
                identity: { principalId: first },
                session: { id: first },
              }),
            },
            demo: true,
            software: {
              [screen.module]: {
                read,
                change,
                list: vi.fn().mockResolvedValue({
                  items: [screen.value(first), screen.value(second)],
                  nextCursor: null,
                }),
                releases: vi.fn().mockResolvedValue([]),
              },
            },
          },
        },
      },
    })
    await flushPromises()
    return { router, wrapper, read, change }
  }
  it(`${screen.module}: resets on query navigation and fences late responses and failed target reads`, async () => {
    const { router, wrapper, read } = await setup()
    expect((wrapper.get(screen.field).element as HTMLInputElement).value).toBe(first)
    let complete!: (value: ReturnType<typeof screen.value>) => void
    read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    await router.push({ path: '/', query: { [screen.query]: second } })
    await flushPromises()
    expect(
      wrapper.find(screen.field).exists()
        ? (wrapper.get(screen.field).element as HTMLInputElement).value
        : '',
    ).toBe('')
    await router.push({ path: '/', query: { [screen.query]: first } })
    await flushPromises()
    complete(screen.value(second))
    await flushPromises()
    expect((wrapper.get(screen.field).element as HTMLInputElement).value).toBe(first)
    read.mockRejectedValueOnce(new Error('unavailable'))
    await router.push({ path: '/', query: { [screen.query]: second } })
    await flushPromises()
    expect(
      wrapper.find(screen.field).exists()
        ? (wrapper.get(screen.field).element as HTMLInputElement).value
        : '',
    ).toBe('')
    wrapper.unmount()
  })
  if (screen.write)
    it(`${screen.module}: refreshes the selected object after a confirmed write on another object`, async () => {
      const { wrapper, read, change } = await setup()
      await wrapper.get(screen.write).trigger('click')
      await flushPromises()
      expect(change).toHaveBeenCalledTimes(1)
      await wrapper
        .findAll('button')
        .find((b) => b.text() === '重新读取')!
        .trigger('click')
      await flushPromises()
      await wrapper
        .findAll('li button')
        .find((b) => b.text().includes(second))!
        .trigger('click')
      await flushPromises()
      await wrapper.get(screen.refresh).trigger('click')
      await flushPromises()
      expect(read).toHaveBeenLastCalledWith(second)
      expect((wrapper.get(screen.field).element as HTMLInputElement).value).toBe(second)
      wrapper.unmount()
    })
}
