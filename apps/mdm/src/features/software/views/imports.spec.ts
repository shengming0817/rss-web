import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import type { ImportChange } from '../clients/imports'
import type { Operation } from '../../../services/useOperation'
import ImportsView from './ImportsView.vue'
it('starts from a pinned resolution and fences further submissions until an unknown start is reconciled', async () => {
  const resolution = {
    id: '11111111-1111-4111-8111-111111111111',
    source: { id: 'winget', revision: '1', sha256: [] },
    ecosystem: 'winget',
    package: 'Example.Browser',
    version: '128.0',
    platform: 'windows',
    architecture: 'x86_64',
    definitionDigest: [],
    expiresAt: 4102444800,
  }
  let pending: Operation<ImportChange>
  const change = vi.fn(async (_: string, body: Operation<ImportChange>) => {
    pending = body
    throw new Error('response lost')
  })
  const read = vi.fn(async (id: string) => ({
    id,
    revision: 2,
    operation: pending.operationId,
    resolution,
    resource: 'browser',
    version: '1',
    status: 'completed',
    failure: null,
    resourceRevision: 1,
  }))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ImportsView }],
  })
  await router.push('/')
  const wrapper = mount(ImportsView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          demo: true,
          software: {
            imports: {
              change,
              read,
              resolve: vi.fn().mockResolvedValue(resolution),
              list: vi.fn().mockResolvedValue({
                items: [
                  {
                    id: 'second-job',
                    resolution,
                    resource: 'second',
                    version: '1',
                    status: 'pending',
                  },
                ],
                nextCursor: null,
              }),
            },
          },
        },
      },
    },
  })
  await flushPromises()
  await wrapper.get('#import-source').setValue('winget')
  await wrapper.get('#import-package').setValue('Example.Browser')
  await wrapper.get('#import-version').setValue('128.0')
  await wrapper.get('[data-form="resolve"]').trigger('submit')
  await flushPromises()
  await wrapper.get('#import-resource').setValue('browser')
  await wrapper.get('[data-form="start"]').trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('提交结果未知')
  expect(change.mock.calls[0]![1].input).toMatchObject({
    action: 'start',
    resolution: resolution.id,
    resource: 'browser',
    expectedResourceRevision: 0,
  })
  expect(wrapper.findAll('fieldset').every((v) => v.attributes('disabled') !== undefined)).toBe(
    true,
  )
  await wrapper.get('[data-action="read-import"]').trigger('click')
  await flushPromises()
  expect(change).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('已导入')
  await wrapper.get('li button').trigger('click')
  await flushPromises()
  await wrapper.get('[data-action="read-import"]').trigger('click')
  await flushPromises()
  expect(read).toHaveBeenLastCalledWith('second-job')
  wrapper.unmount()
})
