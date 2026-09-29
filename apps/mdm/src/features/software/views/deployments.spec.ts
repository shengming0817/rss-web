import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import DeploymentsView from './DeploymentsView.vue'
it('saves the exact approved binding and preserves unknown mutation fencing after a read', async () => {
  const scope = '11111111-1111-4111-8111-111111111111',
    admission = '22222222-2222-4222-8222-222222222222'
  const change = vi.fn().mockRejectedValue(new Error('response lost'))
  const read = vi.fn(async (id: string) => ({
    id,
    revision: 1,
    version: 1,
    versionId: scope,
    enabled: true,
    definition: change.mock.calls[0]![1].input.definition,
  }))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: DeploymentsView }],
  })
  await router.push('/')
  const wrapper = mount(DeploymentsView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: scope,
          demo: true,
          policies: {
            resources: {
              read: vi.fn().mockResolvedValue({
                id: 'app',
                kind: 'software',
                versions: [
                  {
                    id: '1',
                    state: 'active',
                    variants: [{ platform: 'windows', architecture: 'x86_64', key: 'main' }],
                  },
                ],
              }),
            },
          },
          software: {
            assignments: {
              list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
              change,
              read,
            },
            admission: {
              version: vi
                .fn()
                .mockResolvedValue({ admission: { state: 'approved', operation: admission } }),
            },
          },
        },
      },
    },
  })
  await flushPromises()
  await wrapper.get('#deployment-resource').setValue('app')
  await wrapper.get('[data-action="bind-version"]').trigger('click')
  await flushPromises()
  await wrapper.get('#deployment-scope').setValue(scope)
  await wrapper.get('[data-field="stage-scope"]').setValue(scope)
  await wrapper.get('[data-form="deployment"]').trigger('submit')
  await flushPromises()
  expect(change).toHaveBeenCalledTimes(1)
  expect(change.mock.calls[0]![1]).toMatchObject({
    expectedRevision: 0,
    input: {
      definition: {
        resource: { id: 'app', version: '1', variants: { windows_x86_64: 'main' } },
        behavior: { admissionOperation: admission },
      },
    },
  })
  await wrapper.get('[data-action="read-policy"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-form="deployment"] > fieldset').attributes('disabled')).toBeDefined()
  expect(change).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('同一操作')
  wrapper.unmount()
})
