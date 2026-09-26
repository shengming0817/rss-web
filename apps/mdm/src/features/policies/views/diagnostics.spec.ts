import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { expect, it } from 'vitest'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import ExecutionDetailView from './ExecutionDetailView.vue'
import ConfigurationsView from './ConfigurationsView.vue'
it('shows native receipt and cleanup diagnostics while withholding terminal actions', async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:execution', component: ExecutionDetailView }],
  })
  await router.push('/operation')
  const summary = {
    id: 'operation',
    device: 'device',
    batch: null,
    origin: { kind: 'native', operation: 'operation' },
    admission: 'accepted',
    dispatch: 'published',
    receipt: 'received',
    execution: 'failed',
    effect: 'unverified',
    compliance: 'unknown',
    attempt: 'attempt',
    nativeCode: 500,
    waitingReason: 'effect_verification',
  }
  const wrapper = mount(ExecutionDetailView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          demo: true,
          policies: {
            executions: { read: async () => summary },
            native: {
              read: async () => ({
                operationId: 'operation',
                revision: 1,
                task: { kind: 'state_verify' },
                authorization: 'approved',
                commandStatus: 'received',
                observation: {
                  protocol: 'mdm.windows',
                  result: 'matched',
                  effect: 'unknown',
                  progress: 'failed',
                  receiptAccepted: true,
                  writeStatus: 500,
                  attempt: 1,
                  cleanup: 'unsupported',
                },
              }),
            },
          },
        },
      },
    },
  })
  await flushPromises()
  expect(wrapper.text()).toContain('清理状态')
  expect(wrapper.text()).toContain('500')
  expect(wrapper.findAll('button').some((b) => b.text() === '请求取消')).toBe(false)
  wrapper.unmount()
})
it('offers only formats compatible with the selected platform and makes an empty catalog explicit', async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ConfigurationsView }],
  })
  await router.push('/')
  const wrapper = mount(ConfigurationsView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          demo: true,
          policies: { configurations: { list: async () => ({ items: [], nextCursor: null }) } },
        },
      },
    },
  })
  await flushPromises()
  expect(wrapper.text()).toContain('当前没有结果')
  await wrapper.get('#configuration-platform').setValue('macos')
  expect(wrapper.get<HTMLSelectElement>('#configuration-format').element.value).toBe(
    'apple_profile',
  )
  expect(wrapper.findAll('#configuration-format option').map((o) => o.attributes('value'))).toEqual(
    ['apple_profile', 'apple_ddm'],
  )
  wrapper.unmount()
})
