import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import ApprovalsView from './ApprovalsView.vue'
it('keeps explicit workflow approvals without ordinary script approval', async () => {
  const workflow = vi.fn().mockResolvedValue({})
  const items = [
    {
      kind: 'workflow',
      id: 'workflow',
      run: 'run',
      revision: 8,
      author: 'author',
      label: 'Workflow',
    },
  ]
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ApprovalsView }],
  })
  await router.push('/')
  const wrapper = mount(ApprovalsView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          demo: true,
          policies: {
            catalog: { approvals: async () => ({ items, nextCursor: null }) },
            workflows: { changeRun: workflow },
          },
        },
      },
    },
  })
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '批准')!
    .trigger('click')
  await flushPromises()
  expect(workflow.mock.calls[0]).toMatchObject([
    'workflow',
    'run',
    'approve',
    { expectedRevision: 8, input: {} },
  ])
  wrapper.unmount()
})
