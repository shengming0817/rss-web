import { it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import QueryControls from './QueryControls.vue'
import QueryRows from './QueryRows.vue'
const labels = {
  filter: 'Filter',
  sort: 'Sort',
  fields: 'Fields',
  limit: 'Limit',
  apply: 'Apply',
  first: 'First',
  previous: 'Previous',
  next: 'Next',
}
it('emits edits and navigation while validating input without submitting a containing form', async () => {
  const w = mount(QueryControls, {
    props: {
      filter: '',
      sort: '',
      fields: ['id'],
      columns: ['id', 'name'],
      limit: 50,
      maximum: 100,
      labels,
    },
  })
  expect(w.find('form').exists()).toBe(false)
  const inputs = w.findAll('input')
  await inputs[0]!.setValue("id=='x'")
  await inputs[1]!.setValue('-id')
  await inputs[2]!.setValue(1)
  await w.get('select').setValue(['name'])
  expect(w.emitted('update:filter')?.[0]).toEqual(["id=='x'"])
  expect(w.emitted('update:sort')?.[0]).toEqual(['-id'])
  expect(w.emitted('update:limit')?.[0]).toEqual([1])
  expect(w.emitted('update:fields')?.[0]).toEqual([['name']])
  await w.get('fieldset button').trigger('click')
  expect(w.emitted('apply')).toHaveLength(1)
  await inputs[2]!.setValue(101)
  await w.get('fieldset button').trigger('click')
  expect(w.emitted('apply')).toHaveLength(1)
  await inputs[2]!.setValue(2)
  await inputs[0]!.trigger('keydown', { key: 'Enter' })
  expect(w.emitted('apply')).toHaveLength(2)
  const nav = w.findAll('nav button')
  expect(nav[1]!.attributes('disabled')).toBeDefined()
  expect(nav[2]!.attributes('disabled')).toBeDefined()
  await nav[0]!.trigger('click')
  expect(w.emitted('first')).toHaveLength(1)
  await w.setProps({ previous: true, next: true })
  await nav[1]!.trigger('click')
  await nav[2]!.trigger('click')
  expect(w.emitted('previous')).toHaveLength(1)
  expect(w.emitted('next')).toHaveLength(1)
  await w.setProps({ disabled: true })
  await w.get('fieldset button').trigger('click')
  expect(w.emitted('apply')).toHaveLength(2)
  w.unmount()
})
it('displays only returned properties and opens a detail only when its locator is present', async () => {
  const i18n = createI18n({ legacy: false, locale: 'en' })
  const w = mount(QueryRows, {
    props: {
      items: [{ id: 'a', value: null }, { value: { nested: true } }, { id: null, value: 'x' }],
    },
    global: { plugins: [i18n] },
  })
  expect(w.text()).toContain('Full details')
  expect(w.text()).toContain('null')
  expect(w.text()).toContain('{"nested":true}')
  expect(w.text()).toContain('—')
  expect(w.findAll('button')).toHaveLength(1)
  await w.get('button').trigger('click')
  expect(w.emitted('open')?.[0]).toEqual([{ id: 'a', value: null }])
  await w.setProps({ required: ['value'], disabled: true })
  expect(w.findAll('button')).toHaveLength(2)
  expect(w.get('button').attributes('disabled')).toBeDefined()
  i18n.global.locale.value = 'zh'
  await w.setProps({ items: [{ key: 'x' }], required: ['key'], disabled: false })
  expect(w.text()).toContain('完整详情')
  w.unmount()
})
