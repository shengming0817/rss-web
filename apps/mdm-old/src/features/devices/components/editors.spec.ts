import { VSelect, VAutocomplete, VTextField } from 'vuetify/components'
import { nextTick } from 'vue'
import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { mdmI18n } from '../../../i18n'
import { catalog } from '../../../../demo/devices/fixtures'
import type { Criteria } from '../clients/asset-model'
import CriteriaEditor from './CriteriaEditor.vue'
import ConditionContextEditor from './ConditionContextEditor.vue'
import ScalarEditor from './ScalarEditor.vue'
import PersonDisplay from './PersonDisplay.vue'
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
  await selectValue(wrapper.findComponent(VSelect), false)
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ kind: 'boolean', value: false }])
  await wrapper.setProps({ modelValue: { kind: 'string', value: 'old' } })
  await wrapper.find('input').setValue('new')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ kind: 'string', value: 'new' }])
  await wrapper.setProps({ modelValue: { kind: 'time', value: 0 } })
  expect(wrapper.get('input').attributes('type')).toBe('datetime-local')
  await wrapper.get('input').setValue('2026-10-20T12:00:00')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
    { kind: 'time', value: Date.parse('2026-10-20T12:00:00Z') / 1000 },
  ])
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
  await selectValue(wrapper.findComponent(VSelect), 'predicate')
  await selectValue(wrapper.findComponent(VAutocomplete), 'custom.is_loaner')
  expect(wrapper.props('modelValue')).toEqual({
    kind: 'predicate',
    field: 'custom.is_loaner',
    op: 'eq',
    value: { kind: 'boolean', value: false },
  })
  await selectValue(wrapper.findAllComponents(VSelect)[1]!, 'in')
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
  await selectValue(wrapper.findAllComponents(VSelect)[1]!, 'is_null')
  expect(wrapper.props('modelValue')).not.toHaveProperty('value')
  await selectValue(wrapper.findComponent(VSelect), 'or')
  await wrapper.find('button').trigger('click')
  expect(wrapper.props('modelValue')).toEqual({
    kind: 'or',
    children: [{ kind: 'and', children: [] }],
  })
  const child = wrapper.findAllComponents(CriteriaEditor).find((w) => w.props('depth') === 1)!
  await selectValue(child.findComponent(VSelect), 'predicate')
  expect(wrapper.props('modelValue')).toMatchObject({
    kind: 'or',
    children: [{ kind: 'predicate' }],
  })
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '移除')!
    .trigger('click')
  expect(wrapper.props('modelValue')).toEqual({ kind: 'or', children: [] })
  await selectValue(wrapper.findComponent(VSelect), 'all')
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
  const context = () => wrapper.findComponent(ConditionContextEditor)
  const select = () => context().findComponent(VSelect)
  await selectValue(select(), 'all_authorized')
  expect(wrapper.props('modelValue')).toMatchObject({
    selector: { kind: 'all_authorized' },
    quantifier: 'any',
    criteria: model.criteria,
  })
  await selectValue(
    wrapper.findComponent(ConditionContextEditor).findAllComponents(VSelect).at(-1)!,
    'all',
  )
  expect(wrapper.props('modelValue')?.quantifier).toBe('all')
  await selectValue(select(), 'local_user')
  await selectValue(wrapper.findAllComponents(VSelect)[1]!, 'macos')
  await wrapper
    .findAllComponents(VTextField)
    .find((w) => w.props('label') === 'UID')!
    .get('input')
    .setValue('501')
  expect(wrapper.props('modelValue')?.selector).toEqual({
    kind: 'local_user',
    platform: 'macos',
    identity: '501',
  })
  await selectValue(select(), 'exact')
  expect(wrapper.props('modelValue')).toMatchObject({
    selector: { kind: 'exact', scope: { kind: 'device' } },
    quantifier: 'one',
    criteria: model.criteria,
  })
  await selectValue(select(), 'unfiltered')
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
  await selectValue(wrapper.findComponent(VSelect), 'native_certificates')
  await selectValue(wrapper.findAllComponents(VSelect)[1]!, 'macos')
  await selectValue(wrapper.findAllComponents(VSelect)[2]!, 'login')
  expect(wrapper.props('modelValue')).toMatchObject({
    kind: 'native_certificates',
    platform: 'macos',
    store: 'login',
    owner: { kind: 'macos' },
  })
  await wrapper.findAll('input[type=number]')[0]!.setValue('501')
  await wrapper
    .findAllComponents(VTextField)
    .find((w) => w.props('label') === 'GeneratedUID')!
    .get('input')
    .setValue('11111111-1111-4111-8111-111111111111')
  expect(wrapper.props('modelValue')).toMatchObject({
    owner: { kind: 'macos', uid: 501, generated_uid: '11111111-1111-4111-8111-111111111111' },
  })
  await selectValue(wrapper.findComponent(VSelect), 'macos_brew')
  await wrapper
    .findAllComponents(VTextField)
    .find((w) => String(w.props('label')).includes('Tap'))!
    .get('input')
    .setValue('homebrew/core, corp/tools')
  expect(wrapper.props('modelValue')).toMatchObject({
    kind: 'macos_brew',
    taps: ['homebrew/core', 'corp/tools'],
  })
  wrapper.unmount()
})

it('emits condition edits without mutating an already loaded server snapshot', async () => {
  const { default: ConditionEditor } = await import('./ConditionEditor.vue')
  const original = {
    selector: { kind: 'local_user' as const, platform: 'windows' as const, identity: 'S-1-5-21' },
    quantifier: 'any' as const,
    criteria: { kind: 'and' as const, children: [] },
  }
  const before = structuredClone(original)
  const wrapper = mount(ConditionEditor, {
    props: { modelValue: original, fields: catalog },
    global: { plugins: [mdmI18n()] },
  })
  await wrapper
    .findAllComponents(VTextField)
    .find((w) => w.props('label') === 'SID')!
    .get('input')
    .setValue('S-1-5-22')
  expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
    selector: { identity: 'S-1-5-22' },
  })
  await selectValue(
    wrapper.findComponent(ConditionContextEditor).findAllComponents(VSelect).at(-1)!,
    'all',
  )
  expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({ quantifier: 'all' })
  expect(original).toEqual(before)
  wrapper.unmount()
})
it('switches an existing group combination without changing its children', async () => {
  const { default: GroupCriteriaEditor } = await import('./GroupCriteriaEditor.vue')
  const modelValue = {
    kind: 'and' as const,
    children: [
      {
        kind: 'predicate' as const,
        field: 'custom.is_loaner',
        op: 'eq' as const,
        value: { kind: 'boolean' as const, value: false },
      },
    ],
  }
  const wrapper = mount(GroupCriteriaEditor, {
    props: { modelValue, fields: catalog, assetContext: 'endpoint' },
    global: { plugins: [mdmI18n()] },
  })
  await selectValue(wrapper.findComponent(VSelect), 'or')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
    { kind: 'or', children: modelValue.children },
  ])
  wrapper.unmount()
})

it('keeps local login distinct from each source name and shows unavailable source states', async () => {
  const i18n = mdmI18n()
  i18n.global.locale.value = 'zh-CN'
  const wrapper = mount(PersonDisplay, {
    props: {
      display: {
        login: 'local-login',
        profiles: [
          {
            source: { kind: 'identity_local' },
            status: 'available',
            displayName: 'Local Person',
            username: 'different-alias',
          },
          {
            source: { kind: 'idp', provider: '44444444-4444-4444-8444-444444444444' },
            status: 'expired',
            displayName: null,
            username: null,
          },
        ],
      },
    },
    global: { plugins: [i18n] },
  })
  expect(wrapper.text()).toContain('登录名: local-login')
  expect(wrapper.text()).toContain('Local Person')
  expect(wrapper.text()).toContain('来源用户名: different-alias')
  expect(wrapper.text()).toContain('资料已过期')
  await wrapper.setProps({ display: null })
  expect(wrapper.text()).toBe('未提供人员展示资料')
  wrapper.unmount()
})

async function selectValue(
  target: { vm: { $emit: (event: string, value: never) => unknown } },
  value: unknown,
) {
  target.vm.$emit('update:modelValue', value as never)
  await nextTick()
}
