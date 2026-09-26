import { mount, flushPromises } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { mdmI18n } from '../../../i18n'
import UtcTimeInput from './UtcTimeInput.vue'
it('converts readable UTC wall time to epoch seconds independently of local DST and echoes the same instant', async () => {
  const wrapper = mount(UtcTimeInput, {
    props: { id: 'date', modelValue: 0 },
    global: { plugins: [mdmI18n()] },
  })
  expect(wrapper.get('output').text()).toBe('1970-01-01 00:00:00 UTC')
  await wrapper.get('input').setValue('2026-11-01T01:30')
  const value = wrapper.emitted('update:modelValue')!.at(-1)![0] as number
  expect(value).toBe(Date.UTC(2026, 10, 1, 1, 30) / 1000)
  await wrapper.setProps({ modelValue: value })
  await flushPromises()
  expect(wrapper.get('output').text()).toBe('2026-11-01 01:30:00 UTC')
  await wrapper.get('input').setValue('')
  expect(Number.isNaN(wrapper.emitted('update:modelValue')!.at(-1)![0])).toBe(true)
  wrapper.unmount()
})
