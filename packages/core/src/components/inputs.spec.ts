import './__tests__/setup'
import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { h, type Component } from 'vue'
import * as Ui from './index'
import { formatUtc, parseUtc } from './utc'

describe('controlled input primitives', () => {
  it('associates field label, help, error and required state with the real control', async () => {
    const wrapper = mount(Ui.UiField, {
      props: { id: 'name', label: 'Name', description: 'Help', error: 'Invalid', required: true },
      slots: {
        default: (field: {
          id: string
          describedBy: string | undefined
          invalid: boolean
          required: boolean | undefined
        }) =>
          h(Ui.UiInput, {
            id: field.id,
            modelValue: '',
            'aria-describedby': field.describedBy,
            invalid: field.invalid,
            required: field.required,
          }),
      },
    })
    expect(wrapper.get('label').attributes('for')).toBe('name')
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('name-help name-error')
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('[role=alert]').text()).toBe('Invalid')
    await wrapper.setProps({ error: '', description: '', required: false })
    expect(wrapper.find('[role=alert]').exists()).toBe(false)
    expect(wrapper.get('input').attributes('aria-describedby')).toBeUndefined()
  })
  it('exposes native text and multiline editing without storing values', async () => {
    const input = mount(Ui.UiInput, {
      props: { modelValue: '' },
      attrs: { 'aria-label': 'Text', readonly: true },
    })
    expect(input.get('input').element.readOnly).toBe(true)
    await input.setProps({ readonly: false, type: 'password', invalid: true })
    await input.get('input').setValue('secret')
    expect(input.emitted('update:modelValue')?.[0]).toEqual(['secret'])
    const area = mount(Ui.UiTextarea, {
      props: { modelValue: '', invalid: true },
      attrs: { 'aria-label': 'Notes' },
    })
    await area.get('textarea').setValue('line 1\nline 2')
    expect(area.emitted('update:modelValue')?.[0]).toEqual(['line 1\nline 2'])
    await area.setProps({ invalid: false })
    expect(area.get('textarea').attributes('aria-invalid')).toBeUndefined()
  })
  it('emits a number or explicit empty value and preserves native bounds', async () => {
    const wrapper = mount(Ui.UiNumberInput, {
      props: { modelValue: 2, min: 0, max: 10, step: 2 },
      attrs: { 'aria-label': 'Quantity' },
    })
    expect(wrapper.get('input').attributes('step')).toBe('2')
    await wrapper.get('input').setValue('8')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([8])
    await wrapper.get('input').setValue('')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null])
    await wrapper.setProps({ modelValue: null, invalid: true })
    expect(wrapper.get('input').element.value).toBe('')
  })
  it('renders a mixed checkbox and only emits the user selection', async () => {
    const wrapper = mount(Ui.UiCheckbox, {
      props: { label: 'Select', modelValue: 'indeterminate' },
    })
    expect(wrapper.get('input').element.indeterminate).toBe(true)
    await wrapper.get('input').setValue(true)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true])
    await wrapper.setProps({ modelValue: true, disabled: true })
    expect(wrapper.get('input').element.disabled).toBe(true)
  })
  it('keeps radio options controlled and disabled choices unavailable', async () => {
    const options = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
      { value: 'c', label: 'Gamma', disabled: true },
    ]
    const group = mount(Ui.UiRadioGroup, { props: { modelValue: 'a', label: 'Choice', options } })
    await group.get('input[value=b]').setValue(true)
    expect(group.emitted('update:modelValue')?.at(-1)).toEqual(['b'])
    expect(group.get('input[value=c]').element).toHaveProperty('disabled', true)
    const select = mount(Ui.UiSelect, {
      props: { modelValue: 'a', options },
      attrs: { 'aria-label': 'Choice' },
    })
    await select.get('select').setValue('b')
    expect(select.emitted('update:modelValue')?.at(-1)).toEqual(['b'])
    await select.setProps({ invalid: true })
    expect(select.get('select').attributes('aria-invalid')).toBe('true')
  })
  it('submits and clears a search while allowing its owner to do the searching', async () => {
    const wrapper = mount(Ui.UiSearchInput, {
      props: { modelValue: '', label: 'Search', clearLabel: 'Clear' },
    })
    expect(wrapper.find('button').exists()).toBe(false)
    await wrapper.get('input').setValue('Alpha')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Alpha'])
    await wrapper.setProps({ modelValue: 'Alpha' })
    await wrapper.get('input').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('search')?.at(-1)).toEqual(['Alpha'])
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
  })
  it('separates calendar and wall time values from instants', async () => {
    const wrapper = mount(Ui.UiDateInput, {
      props: { modelValue: null },
      attrs: { 'aria-label': 'Date' },
    })
    await wrapper.get('input').setValue('2026-11-01')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['2026-11-01'])
    await wrapper.setProps({ modelValue: '01:30', kind: 'time', invalid: true })
    expect(wrapper.get('input').element.value).toBe('01:30')
    await wrapper.get('input').setValue('')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null])
  })
  it('round trips UTC independently of DST and rejects invalid calendar values', async () => {
    for (const value of [null, NaN, Infinity, -1, 1.5, 253402300800])
      expect(formatUtc(value)).toBe('')
    for (const value of [
      '',
      'not-date',
      '2026-02-30T12:00',
      '2026-13-01T00:00',
      '2026-11-01T01:30:00Z',
    ])
      expect(parseUtc(value)).toBeNull()
    expect(parseUtc('2026-11-01T01:30')).toBe(Date.UTC(2026, 10, 1, 1, 30) / 1000)
    expect(parseUtc('2024-02-29T12:00:00')).toBe(Date.UTC(2024, 1, 29, 12) / 1000)
    const wrapper = mount(Ui.UiUtcDateTimeInput, {
      props: { id: 'utc', modelValue: 0, invalidLabel: 'Invalid', required: true },
    })
    expect(wrapper.get('output').text()).toBe('1970-01-01 00:00:00 UTC')
    await wrapper.get('input').setValue('2026-11-01T01:30')
    const value = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as number
    await wrapper.setProps({ modelValue: value, min: 0, max: 253402300799 })
    expect(wrapper.get('output').text()).toBe('2026-11-01 01:30:00 UTC')
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('utc-utc')
    await wrapper.get('input').setValue('')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null])
    await wrapper.setProps({ modelValue: null })
    await flushPromises()
    expect(wrapper.get('input').element.validity.valueMissing).toBe(true)
    await wrapper.setProps({ modelValue: NaN })
    await flushPromises()
    expect(wrapper.get('input').element.validationMessage).toBe('Invalid')
    await wrapper.setProps({ modelValue: 0, error: 'Outside domain range' })
    await flushPromises()
    expect(wrapper.get('input').element.validationMessage).toBe('Outside domain range')
  })
})

it.each([
  ['checkbox', Ui.UiCheckbox, { label: 'Choice', modelValue: false }],
  ['search', Ui.UiSearchInput, { label: 'Search', clearLabel: 'Clear', modelValue: '' }],
  [
    'combobox',
    Ui.UiCombobox,
    {
      label: 'Choice',
      options: [{ value: 'a', label: 'Alpha' }],
      emptyLabel: 'Empty',
      invalidLabel: 'Select an option',
      modelValue: 'a',
    },
  ],
  ['utc', Ui.UiUtcDateTimeInput, { modelValue: null, invalidLabel: 'Invalid' }],
] as const)('routes %s field attributes to its actual control', async (kind, component, props) => {
  const form = document.createElement('form')
  document.body.append(form)
  const wrapper = mount(Ui.UiField, {
    attachTo: form,
    props: { id: 'field', label: 'Field', description: 'Help', error: 'Error', required: true },
    slots: {
      default: (field: {
        id: string
        describedBy: string | undefined
        invalid: boolean
        required: boolean | undefined
      }) =>
        h(component as Component, {
          ...props,
          id: field.id,
          name: 'value',
          required: field.required,
          invalid: field.invalid,
          'aria-describedby': field.describedBy,
        }),
    },
  })
  await flushPromises()
  const input = wrapper.get<HTMLInputElement>('input#field')
  if (kind === 'combobox') {
    expect(new FormData(form).get('value')).toBe('a')
  } else expect(input.attributes('name')).toBe('value')
  expect(input.element.required).toBe(kind !== 'combobox')
  if (kind === 'combobox') expect(input.attributes('aria-required')).toBe('true')
  expect(input.attributes('aria-invalid')).toBe('true')
  expect(input.attributes('aria-describedby')).toBe(
    kind === 'utc' ? 'field-help field-error field-utc' : 'field-help field-error',
  )
  expect(wrapper.find('label[for=field]').exists()).toBe(true)
  await wrapper.setProps({ error: '', description: '', required: false })
  expect(input.element.required).toBe(false)
  expect(input.attributes('aria-describedby')).toBe(kind === 'utc' ? 'field-utc' : undefined)
})

it('keeps a readonly search from being cleared through its secondary action', () => {
  const wrapper = mount(Ui.UiSearchInput, {
    props: { label: 'Search', clearLabel: 'Clear', modelValue: 'Retain', readonly: true },
  })
  expect(wrapper.get('input').element.readOnly).toBe(true)
  expect(wrapper.get('button').element.disabled).toBe(true)
  wrapper.get('button').element.click()
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
})
