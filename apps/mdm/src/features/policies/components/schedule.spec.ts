import { mount, flushPromises } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { mdmI18n } from '../../../i18n'
import { decodeSchedule, type Schedule } from '../clients/schedule'
import ScheduleEditor from './ScheduleEditor.vue'
it('rejects impossible combinations in DTO decoding and blocks the corresponding editor input', async () => {
  const schedule: Schedule = {
    trigger: { kind: 'once', at: 5 },
    misfire: 'skip',
    notBefore: 10,
    until: 20,
    jitterSeconds: 0,
    window: null,
  }
  expect(() => decodeSchedule(schedule)).toThrow()
  const wrapper = mount(ScheduleEditor, {
    props: { modelValue: schedule },
    global: { plugins: [mdmI18n()] },
  })
  await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  expect(
    wrapper
      .findAll<HTMLInputElement>('input')
      .some((input) => input.element.validationMessage.length > 0),
  ).toBe(true)
  await wrapper.setProps({ modelValue: { ...schedule, trigger: { kind: 'once', at: 15 } } })
  await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  wrapper.unmount()
})

it('offers readable UTC absolute date fields while retaining numeric durations', () => {
  const modelValue: Schedule = {
    trigger: { kind: 'once', at: 1790000100 },
    misfire: 'skip',
    notBefore: 1790000000,
    until: 1790000200,
    jitterSeconds: 0,
    window: null,
  }
  const wrapper = mount(ScheduleEditor, { props: { modelValue }, global: { plugins: [mdmI18n()] } })
  expect(wrapper.findAll('input[type="datetime-local"]')).toHaveLength(3)
  expect(wrapper.text()).toContain('UTC')
  wrapper.unmount()
})
