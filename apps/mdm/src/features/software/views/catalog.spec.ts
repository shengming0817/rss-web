import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import type { Operation } from '../../../services/useOperation'
import type { CatalogChange } from '../clients/catalog'
import CatalogView from './CatalogView.vue'
it('saves catalog metadata at its own revision and renders unsampled usage as unknown', async () => {
  const entry = {
    resource: { id: 'app', kind: 'software', revision: 5, versions: [] },
    metadata: {
      revision: 0,
      operation: null,
      definition: {
        title: 'App',
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
      totalDevices: 24,
      activeDevices: null,
      unknownDevices: 24,
      source: 'unavailable',
    },
  }
  const read = vi.fn().mockResolvedValue(entry)
  const change = vi.fn(async (_: string, body: Operation<CatalogChange>) => {
    const { title, description, category, license, supersedes } = body.input
    const definition = { title, description, category, license, supersedes }
    return { ...entry, metadata: { revision: 1, operation: body.operationId, definition } }
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: CatalogView }],
  })
  await router.push('/')
  const wrapper = mount(CatalogView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          demo: true,
          software: {
            catalog: {
              read,
              change,
              list: vi.fn().mockResolvedValue({ items: [entry], nextCursor: null }),
            },
          },
        },
      },
    },
  })
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'App · app')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('尚无使用采样')
  expect(wrapper.text()).toContain('0 / 24')
  await wrapper.get('#catalog-license').setValue('commercial')
  await wrapper.get('#catalog-seats').setValue('40')
  await wrapper.get('#catalog-title').setValue('Editor')
  await wrapper.findAll('form')[2]!.trigger('submit')
  await flushPromises()
  expect(change.mock.calls[0]).toEqual([
    'app',
    expect.objectContaining({
      expectedRevision: 0,
      input: expect.objectContaining({
        action: 'put',
        title: 'Editor',
        license: { kind: 'commercial', seats: 40, expiresAt: null },
      }),
    }),
  ])
  expect(wrapper.text()).toContain('Editor')
  wrapper.unmount()
})
