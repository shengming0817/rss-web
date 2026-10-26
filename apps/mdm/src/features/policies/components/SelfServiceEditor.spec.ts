import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { mdmI18n } from '../../../i18n'
import type { SelfService } from '../clients/model'
import SelfServiceEditor from './SelfServiceEditor.vue'
it('defaults only a first publication and preserves values across withdrawal and republishing', async () => {
  const wrapper = mount(SelfServiceEditor, { global: { plugins: [mdmI18n()] } })
  await wrapper.get('[data-field="published"]').setValue(true)
  const first = wrapper.emitted('update:modelValue')?.[0]?.[0]
  expect(first).toMatchObject({ published: true, allowAi: true, riskLevel: 2 })
  await wrapper.setProps({
    modelValue: {
      ...(first as SelfService),
      presentation: {
        ...(first as SelfService).presentation,
        displayName: 'Support',
        category: 'Support',
      },
      allowAi: false,
      riskLevel: 1,
    },
  })
  await wrapper.get('[data-field="published"]').setValue(false)
  await wrapper.get('[data-field="published"]').setValue(true)
  expect((wrapper.get('[data-field="allowAi"]').element as HTMLInputElement).checked).toBe(false)
  expect((wrapper.get('[data-field="riskLevel"]').element as HTMLSelectElement).value).toBe('1')
  expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  wrapper.unmount()
})
it('keeps access undecided while letting administrators select risk and AI settings', async () => {
  const value = {
    published: false,
    access: null,
    presentation: {
      displayName: 'App',
      description: '',
      prerequisites: '',
      sideEffects: '',
      category: 'Apps',
      keywords: [],
    },
    allowAi: false,
    riskLevel: 2,
  } as SelfService
  const wrapper = mount(SelfServiceEditor, {
    props: { modelValue: value },
    global: { plugins: [mdmI18n()] },
  })
  expect(wrapper.find('[data-field="access-required"]').exists()).toBe(true)
  await wrapper.get('[data-field="riskLevel"]').setValue('1')
  expect(value.riskLevel).toBe(1)
  await wrapper.get('[data-field="allowAi"]').setValue(true)
  expect(value.allowAi).toBe(true)
  await wrapper.get('[data-field="access"]').setValue('device')
  expect(value.access).toEqual({ kind: 'device' })
  expect(wrapper.find('[data-field="access-required"]').exists()).toBe(false)
  await wrapper.get('[data-field="access"]').setValue('authenticated_user')
  expect(value.access).toEqual({ kind: 'authenticated_user' })
  wrapper.unmount()
})
