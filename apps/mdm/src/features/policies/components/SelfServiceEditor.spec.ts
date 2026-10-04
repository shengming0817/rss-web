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
      displayName: 'Support',
      category: 'Support',
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
