import { it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { identityI18n } from '../i18n'
import AccountQueryControls from './AccountQueryControls.vue'
it('edits source and server query properties, and exposes explicit page navigation', async () => {
  const locale = identityI18n()
  const wrapper = mount(AccountQueryControls, {
    props: {
      query: { source: 'local', filter: '', sort: '', fields: ['principalId'], limit: 50 },
      departments: true,
      previous: true,
      next: true,
    },
    global: { plugins: [locale] },
  })
  const inputs = wrapper.findAll('input')
  await inputs[0]!.setValue('11111111-1111-4111-8111-111111111111')
  await inputs[1]!.setValue("departmentSubtree=='engineering'")
  await inputs[2]!.setValue('-email')
  await inputs[3]!.setValue(1)
  await wrapper.get('select').setValue(['principalId', 'email', 'departmentStatus'])
  expect(wrapper.emitted('change')).toEqual([
    [{ source: '11111111-1111-4111-8111-111111111111' }],
    [{ filter: "departmentSubtree=='engineering'" }],
    [{ sort: '-email' }],
    [{ limit: 1 }],
    [{ fields: ['principalId', 'email', 'departmentStatus'] }],
  ])
  for (const text of ['应用查询', '首页 / 重新查询', '上一页', '下一页'])
    await wrapper
      .findAll('button')
      .find((b) => b.text() === text)!
      .trigger('click')
  for (const name of ['apply', 'first', 'previous', 'next'])
    expect(wrapper.emitted(name)).toHaveLength(1)
  expect(wrapper.text()).toContain('departmentSubtree')
  locale.global.locale.value = 'en-US'
  await wrapper.setProps({ departments: false })
  expect(wrapper.text()).toContain('Profile source')
  expect(wrapper.findAll('option').some((v) => v.attributes('value') === 'departmentStatus')).toBe(
    false,
  )
  wrapper.unmount()
})
