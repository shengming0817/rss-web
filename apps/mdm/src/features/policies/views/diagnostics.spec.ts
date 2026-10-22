import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { ref } from 'vue'
import { expect, it, vi } from 'vitest'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import ExecutionDetailView from './ExecutionDetailView.vue'
it('shows native receipt and cleanup diagnostics while withholding terminal actions', async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:execution', component: ExecutionDetailView }],
  })
  await router.push('/11111111-1111-4111-8111-111111111111?device=device')
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
            native: {
              read: async () => ({
                operationId: 'operation',
                revision: 1,
                target: { kind: 'device' },
                dispatchFailure: {
                  platform: 'windows',
                  reason: 'management_address_not_configured',
                },
                task: {
                  platform: 'windows',
                  kind: 'sync_ml',
                  name: 'SyncML',
                  objects: ['./Device/Vendor/MSFT/Reboot/RebootNow'],
                },
                authorization: 'authorized',
                commandStatus: 'received',
                observation: {
                  protocol: 'syncml',
                  observationScope: 'native_objects',
                  receipts: [{ writeStatus: 500, cleanup: 'unsupported' }],
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
  expect(wrapper.text()).toContain('500')
  expect(wrapper.text()).toContain('management_address_not_configured')
  expect(wrapper.get('[data-testid=native-task-facts]').text()).toContain('重启')
  expect(wrapper.get('[data-testid=native-task-facts]').text()).toContain('device')
  expect(wrapper.findAll('button').some((b) => b.text() === '请求取消')).toBe(false)
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
    target: { kind: 'device' },
    task: {
      platform: 'windows',
      kind: 'sync_ml',
      name: 'SyncML',
      objects: ['./Device/Vendor/MSFT/Reboot/RebootNow'],
    },
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
