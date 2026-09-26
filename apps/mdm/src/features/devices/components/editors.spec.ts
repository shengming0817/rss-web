import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { mdmI18n } from '../../../i18n'
import { catalog } from '../../../../demo/devices/fixtures'
import type { Criteria } from '../clients/asset-model'
import CriteriaEditor from './CriteriaEditor.vue'
import ScalarEditor from './ScalarEditor.vue'
it('keeps scalar types, false and zero and rejects unsafe integers', async () => {
  const wrapper = mount(ScalarEditor, {
    props: { modelValue: { kind: 'integer', value: 1 } },
    global: { plugins: [mdmI18n()] },
  })
  await wrapper.find('input').setValue('0')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ kind: 'integer', value: 0 }])
  await wrapper.find('input').setValue('9007199254740993')
  expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  await wrapper.setProps({ modelValue: { kind: 'boolean', value: true } })
  await wrapper.find('select').setValue('false')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ kind: 'boolean', value: false }])
  await wrapper.setProps({ modelValue: { kind: 'string', value: 'old' } })
  await wrapper.find('input').setValue('new')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ kind: 'string', value: 'new' }])
  await wrapper.setProps({ modelValue: { kind: 'time', value: 0 } })
  expect(wrapper.text()).toContain('Unix')
  wrapper.unmount()
})
it('edits catalog-driven set predicates and nested AND/OR without flattening', async () => {
  const wrapper = mount(CriteriaEditor, {
    props: {
      modelValue: null as Criteria | null,
      fields: catalog,
      'onUpdate:modelValue': (v: Criteria | null) => wrapper.setProps({ modelValue: v }),
    },
    global: { plugins: [mdmI18n()] },
  })
  await wrapper.find('select').setValue('predicate')
  await wrapper.findAll('select')[1]!.setValue('custom.is_loaner')
  expect(wrapper.props('modelValue')).toEqual({
    kind: 'predicate',
    field: 'custom.is_loaner',
    op: 'eq',
    value: { kind: 'boolean', value: false },
  })
  await wrapper.findAll('select')[2]!.setValue('in')
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '添加')!
    .trigger('click')
  expect(wrapper.props('modelValue')).toMatchObject({
    values: [
      { kind: 'boolean', value: false },
      { kind: 'boolean', value: false },
    ],
  })
  await wrapper.find('button').trigger('click')
  expect(wrapper.props('modelValue')).toMatchObject({ values: [{ kind: 'boolean', value: false }] })
  await wrapper.findAll('select')[2]!.setValue('is_null')
  expect(wrapper.props('modelValue')).not.toHaveProperty('value')
  await wrapper.find('select').setValue('or')
  await wrapper.find('button').trigger('click')
  expect(wrapper.props('modelValue')).toEqual({
    kind: 'or',
    children: [{ kind: 'and', children: [] }],
  })
  const child = wrapper.findAllComponents(CriteriaEditor).find((w) => w.props('depth') === 1)!
  await child.find('select').setValue('predicate')
  expect(wrapper.props('modelValue')).toMatchObject({
    kind: 'or',
    children: [{ kind: 'predicate' }],
  })
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '移除')!
    .trigger('click')
  expect(wrapper.props('modelValue')).toEqual({ kind: 'or', children: [] })
  await wrapper.find('select').setValue('all')
  expect(wrapper.props('modelValue')).toBeNull()
  wrapper.unmount()
})
