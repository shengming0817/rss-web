import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { expect, it } from 'vitest'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import WorkflowsView from './WorkflowsView.vue'
it('shows a second-subject requirement only for a pending explicit approval and keeps demo help out of live UI', async () => {
  for (const approval of ['not_required', 'pending']) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: WorkflowsView }],
    })
    await router.push('/?id=workflow&run=run')
    const definition = {
      name: 'Workflow',
      scope: 'scope',
      schedule: {
        trigger: { kind: 'manual' },
        misfire: 'skip',
        notBefore: 1790000000,
        until: 1790000200,
        jitterSeconds: 0,
        window: null,
      },
      steps: [],
    }
    const wrapper = mount(WorkflowsView, {
      global: {
        plugins: [router, mdmI18n()],
        stubs: { RouterLink: true },
        provide: {
          [mdmKey as symbol]: {
            tenant: 'tenant',
            demo: false,
            devices: { assets: { catalog: async () => ({ fields: [] }) } },
            policies: {
              catalog: { list: async () => ({ items: [], nextCursor: null }) },
              workflows: {
                read: async () => ({
                  id: 'workflow',
                  revision: 1,
                  version: 1,
                  status: 'active',
                  definition,
                }),
                run: async () => ({
                  id: 'run',
                  workflow: 'workflow',
                  revision: 1,
                  version: 1,
                  definition,
                  approval,
                  state: 'waiting',
                  author: 'author',
                  targets: [],
                  executions: [],
                }),
              },
            },
          },
        },
      },
    })
    await flushPromises()
    expect(wrapper.text().includes('当前步骤等待其他账户批准')).toBe(approval === 'pending')
    expect(wrapper.text()).not.toContain('reviewer')
    expect(wrapper.text()).toContain('仅显式人工审批步骤')
    wrapper.unmount()
  }
})
