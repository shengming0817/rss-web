import { ref } from 'vue'
import { VDialog } from 'vuetify/components'
import { flushPromises, mount, DOMWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { expect, it, vi } from 'vitest'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import DeviceControlPanel from './DeviceControlPanel.vue'
import type { EndpointDetail } from '../clients/endpoint-model'
async function fixture(source: 'mdm.windows' | 'mdm.apple') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: DeviceControlPanel }],
  })
  await router.push('/')
  const create = vi.fn().mockRejectedValue(new Error('lost reply'))
  const wrapper = mount(DeviceControlPanel, {
    props: {
      deviceName: 'Managed Mac',
      endpoint: {
        id: 'endpoint',
        primaryMdmRegistration: {
          registrationId: '11111111-1111-4111-8111-111111111111',
          generation: 4,
          source,
        },
      } as EndpointDetail,
    },
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: {
          tenant: 'tenant',
          session: { state: ref({ status: 'authenticated' }) },
          policies: { native: { create } },
        },
      },
    },
  })
  return {
    wrapper,
    router,
    create,
    button: (text: string) => wrapper.findAll('button').find((b) => b.text() === text)!,
  }
}
it('binds wipe confirmation to the selected device name and observed registration generation', async () => {
  const f = await fixture('mdm.windows')
  expect(f.button('锁定').attributes('disabled')).toBeDefined()
  await f.button('擦除').trigger('click')
  const dialog = new DOMWrapper(document.body).get('[role=alertdialog]')
  const input = dialog.get('input')
  await input.setValue('Other device')
  expect(dialog.get('button[type=submit]').attributes('disabled')).toBeDefined()
  await input.setValue('Managed Mac')
  await dialog.get('form').trigger('submit')
  await flushPromises()
  expect(f.create.mock.calls[0]?.[1].action).toEqual({
    kind: 'wipe',
    confirmed: true,
    expectedRegistrationId: '11111111-1111-4111-8111-111111111111',
    expectedGeneration: 4,
  })
  expect(f.router.currentRoute.value.query['operation']).toBe(
    f.create.mock.calls[0]?.[1].operationId,
  )
  f.wrapper.unmount()
})
it('clears a six-digit Lock PIN on an unknown submission and keeps only its original locator', async () => {
  const f = await fixture('mdm.apple')
  await f.button('锁定').trigger('click')
  const dialog = new DOMWrapper(document.body).get('[role=alertdialog]')
  await dialog.get('input').setValue('12345')
  expect(dialog.get('button[type=submit]').attributes('disabled')).toBeDefined()
  await dialog.get('input').setValue('123456')
  await dialog.get('form').trigger('submit')
  await flushPromises()
  expect(f.wrapper.getComponent(VDialog).props('modelValue')).toBe(false)
  expect(f.wrapper.text()).toContain('提交结果未知')
  expect(f.button('查询原操作').exists()).toBe(true)
  expect(f.create.mock.calls[0]?.[1].action.pin).toBe('')
  expect(f.router.currentRoute.value.query['operation']).toBe(
    f.create.mock.calls[0]?.[1].operationId,
  )
  expect(JSON.stringify(f.router.currentRoute.value.query)).not.toContain('123456')
  f.wrapper.unmount()
})

it('clears unsubmitted secrets when switching actions and when the selected endpoint changes', async () => {
  const f = await fixture('mdm.apple')
  await f.button('锁定').trigger('click')
  let dialog = new DOMWrapper(document.body).get('[role=alertdialog]')
  await dialog.get('input').setValue('123456')
  await dialog
    .findAll('button')
    .find((b) => b.attributes('type') !== 'submit')!
    .trigger('click')
  await f.button('擦除').trigger('click')
  dialog = new DOMWrapper(document.body).get('[role=alertdialog]')
  expect((dialog.get('input').element as HTMLInputElement).value).toBe('')
  await dialog.get('input').setValue('Managed Mac')
  await f.wrapper.setProps({
    endpoint: { ...f.wrapper.props('endpoint'), id: 'other' },
    deviceName: 'Other Mac',
  })
  expect(f.wrapper.getComponent(VDialog).props('modelValue')).toBe(false)
  await f.button('锁定').trigger('click')
  dialog = new DOMWrapper(document.body).get('[role=alertdialog]')
  expect((dialog.get('input').element as HTMLInputElement).value).toBe('')
  expect(f.create).not.toHaveBeenCalled()
  f.wrapper.unmount()
})
