import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { ref } from 'vue'
import { expect, it, vi } from 'vitest'
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
          session: { state: ref({ status: 'authenticated', session: { id: 'session' } }) },
          demo: true,
          policies: {
            executions: { read: async () => summary },
            native: {
              read: async () => ({
                operationId: 'operation',
                revision: 1,
                task: { platform: 'windows', request: { kind: 'sync_ml' } },
                authorization: 'authorized',
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
          session: { state: ref({ status: 'authenticated', session: { id: 'session' } }) },
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

it('keeps reauthorization coordinates editable character by character and invalidates only the final confirmation', async () => {
  const id = '11111111-1111-4111-8111-111111111111',
    registration = '22222222-2222-4222-8222-222222222222'
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:execution', component: ExecutionDetailView }],
  })
  await router.push({ path: `/${id}`, query: { device: 'device-01' } })
  const read = vi.fn().mockResolvedValue({
    operationId: id,
    revision: 4,
    task: { platform: 'windows', request: { kind: 'sync_ml', request: {} } },
    authorization: 'blocked',
    commandStatus: 'queued',
    agentInstallation: null,
    observation: {
      protocol: 'syncml',
      observationScope: 'native_objects',
      progress: 'unknown',
      effect: 'unverified',
      receipts: [],
    },
  })
  const reauthorize = vi.fn().mockResolvedValue({ operationId: id, revision: 5 })
  const wrapper = mount(ExecutionDetailView, {
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated', session: { id: 'session' } }) },
          policies: { native: { read, reauthorize } },
        },
      },
    },
  })
  try {
    await flushPromises()
    const input = wrapper.get<HTMLInputElement>('input:not([type])'),
      confirmation = wrapper.get('input[type=checkbox]')
    expect((confirmation.element as HTMLInputElement).checked).toBe(false)
    input.element.focus()
    for (let length = 1; length <= registration.length; length++) {
      await input.setValue(registration.slice(0, length))
      expect(document.activeElement).toBe(input.element)
      expect(wrapper.get('input:not([type])').element).toBe(input.element)
    }
    await confirmation.setValue(true)
    await wrapper.get('input[type=number]').setValue(2)
    expect((confirmation.element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.get('input:not([type])').element).toBe(input.element)
    expect(reauthorize).not.toHaveBeenCalled()
    await confirmation.setValue(true)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '重新授权')!
      .trigger('click')
    await flushPromises()
    expect(reauthorize).toHaveBeenCalledExactlyOnceWith('device-01', id, {
      requestId: expect.any(String),
      expectedRevision: 4,
      confirmation: {
        confirmed: true,
        expectedRegistrationId: registration,
        expectedGeneration: 2,
      },
    })
    expect((confirmation.element as HTMLInputElement).checked).toBe(false)
  } finally {
    wrapper.unmount()
  }
})
