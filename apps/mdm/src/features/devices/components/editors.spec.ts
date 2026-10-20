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

it('edits complete condition selectors without changing the predicate or retaining an invalid quantifier', async () => {
  const { default: ConditionEditor } = await import('./ConditionEditor.vue')
  const { deviceCondition } = await import('../clients/asset-model')
  const model = deviceCondition({
    kind: 'predicate',
    field: 'custom.is_loaner',
    op: 'eq',
    value: { kind: 'boolean', value: false },
  })
  const wrapper = mount(ConditionEditor, {
    props: {
      modelValue: model,
      fields: catalog,
      'onUpdate:modelValue': (v) => wrapper.setProps({ modelValue: v }),
    },
    global: { plugins: [mdmI18n()] },
  })
  const select = () => wrapper.find('details select')
  await select().setValue('all_authorized')
  expect(wrapper.props('modelValue')).toMatchObject({
    selector: { kind: 'all_authorized' },
    quantifier: 'any',
    criteria: model.criteria,
  })
  await wrapper.findAll('details select').at(-1)!.setValue('all')
  expect(wrapper.props('modelValue')?.quantifier).toBe('all')
  await select().setValue('local_user')
  await wrapper.findAll('details select')[1]!.setValue('macos')
  await wrapper.find('details input').setValue('501')
  expect(wrapper.props('modelValue')?.selector).toEqual({
    kind: 'local_user',
    platform: 'macos',
    identity: '501',
  })
  await select().setValue('exact')
  expect(wrapper.props('modelValue')).toMatchObject({
    selector: { kind: 'exact', scope: { kind: 'device' } },
    quantifier: 'one',
    criteria: model.criteria,
  })
  await select().setValue('unfiltered')
  expect(wrapper.props('modelValue')).toBeNull()
  wrapper.unmount()
})
it('builds structured exact namespaces and bound account coordinates without JSON input', async () => {
  const { default: ScopeEditor } = await import('./ScopeEditor.vue')
  const wrapper = mount(ScopeEditor, {
    props: {
      modelValue: { kind: 'device' as const },
      'onUpdate:modelValue': (v) => wrapper.setProps({ modelValue: v }),
    },
    global: { plugins: [mdmI18n()] },
  })
  await wrapper.find('select').setValue('native_certificates')
  await wrapper.findAll('select')[1]!.setValue('macos')
  await wrapper.findAll('select')[2]!.setValue('login')
  expect(wrapper.props('modelValue')).toMatchObject({
    kind: 'native_certificates',
    platform: 'macos',
    store: 'login',
    owner: { kind: 'macos' },
  })
  await wrapper.findAll('input[type=number]')[0]!.setValue('501')
  await wrapper.findAll('input[type=text]')[0]!.setValue('11111111-1111-4111-8111-111111111111')
  expect(wrapper.props('modelValue')).toMatchObject({
    owner: { kind: 'macos', uid: 501, generated_uid: '11111111-1111-4111-8111-111111111111' },
  })
  await wrapper.find('select').setValue('macos_brew')
  await wrapper.findAll('input[type=text]').at(-1)!.setValue('homebrew/core, corp/tools')
  expect(wrapper.props('modelValue')).toMatchObject({
    kind: 'macos_brew',
    taps: ['homebrew/core', 'corp/tools'],
  })
  wrapper.unmount()
})
