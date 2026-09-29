import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { mdmI18n } from '../../../i18n'
import NativeScheduleEditor from './NativeScheduleEditor.vue'
it('retains native nullable bounds and tagged misfire while explaining that manual software has no run entry', async () => {
  const schedule = {
    trigger: { kind: 'manual' as const },
    misfire: { kind: 'coalesce_one' as const },
    notBefore: 1790000000,
    until: null,
    jitterSeconds: 0,
    window: null,
  }
  const wrapper = mount(NativeScheduleEditor, {
    props: { modelValue: schedule },
    global: { plugins: [mdmI18n()] },
  })
  expect(wrapper.text()).toContain('不会自动创建运行')
  expect(schedule.until).toBeNull()
  await wrapper.get('[data-field="misfire"]').setValue('skip')
  expect(schedule.misfire).toEqual({ kind: 'skip', maxLatenessSeconds: 30 })
  await wrapper.get('[data-field="until-enabled"]').setValue(true)
  expect(schedule.until).toBeGreaterThan(schedule.notBefore)
  await wrapper.get('[data-field="until-enabled"]').setValue(false)
  expect(schedule.until).toBeNull()
  wrapper.unmount()
})
