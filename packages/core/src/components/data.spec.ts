import './__tests__/setup'
import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import * as Ui from './index'

it('keeps single and multiple list selection controlled and supports empty content', async () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ]
  const wrapper = mount(Ui.UiList, {
    props: { label: 'Items', options, modelValue: [], emptyLabel: 'No items' },
  })
  await wrapper.get('input').setValue(true)
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['a']])
  await wrapper.setProps({ multiple: true, modelValue: ['a'] })
  await wrapper.findAll('input')[1]!.setValue(true)
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['a', 'b']])
  await wrapper.get('input').setValue(false)
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['b']])
  await wrapper.setProps({ options: [] })
  expect(wrapper.text()).toContain('No items')
})
it('preserves selection outside the visible page and emits server-owned sort intentions', async () => {
  const rows = [
    { id: 'a', name: 'Alpha', value: 1 },
    { id: 'b', name: 'Beta', value: null },
  ]
  const wrapper = mount(Ui.UiTable, {
    props: {
      label: 'Results',
      rows,
      columns: [
        { key: 'name', label: 'Name', sortable: true },
        { key: 'value', label: 'Value' },
      ],
      rowKey: (row: object) => (row as (typeof rows)[0]).id,
      selectable: true,
      selected: ['outside'],
      selectionLabel: 'Visible rows',
      rowSelectionLabel: (row: object) => (row as (typeof rows)[0]).name,
      busyLabel: 'Loading',
      emptyLabel: 'Empty',
    },
  })
  expect(wrapper.get('caption').text()).toBe('Results')
  expect(wrapper.text()).toContain('—')
  await wrapper.get('thead input').setValue(true)
  expect(wrapper.emitted('update:selected')?.at(-1)).toEqual([['outside', 'a', 'b']])
  await wrapper.setProps({ selected: ['outside', 'a', 'b'] })
  await wrapper.get('thead input').setValue(false)
  expect(wrapper.emitted('update:selected')?.at(-1)).toEqual([['outside']])
  await wrapper.setProps({ selected: ['a'] })
  expect(wrapper.get('thead input').element).toHaveProperty('indeterminate', true)
  await wrapper.findAll('tbody input')[1]!.setValue(true)
  expect(wrapper.emitted('update:selected')?.at(-1)).toEqual([['a', 'b']])
  await wrapper.findAll('tbody input')[0]!.setValue(false)
  expect(wrapper.emitted('update:selected')?.at(-1)).toEqual([['b']])
  await wrapper.get('th button').trigger('click')
  expect(wrapper.emitted('update:sort')?.at(-1)).toEqual([{ key: 'name', direction: 'asc' }])
  await wrapper.setProps({ sort: { key: 'name', direction: 'asc' } })
  expect(wrapper.get('th[aria-sort]').attributes('aria-sort')).toBe('ascending')
  await wrapper.get('th button').trigger('click')
  expect(wrapper.emitted('update:sort')?.at(-1)).toEqual([{ key: 'name', direction: 'desc' }])
  await wrapper.setProps({ sort: { key: 'name', direction: 'desc' } })
  expect(wrapper.get('th[aria-sort]').attributes('aria-sort')).toBe('descending')
  await wrapper.get('th button').trigger('click')
  expect(wrapper.emitted('update:sort')?.at(-1)).toEqual([null])
  expect(wrapper.findAll('tbody tr')[0]!.text()).toContain('Alpha')
  await wrapper.setProps({ rows: [], busy: true })
  expect(wrapper.get('[role=status]').text()).toBe('Loading')
  await wrapper.setProps({ busy: false, selectable: false })
  expect(wrapper.get('[role=status]').text()).toBe('Empty')
})
it('supports custom table values without requiring field names or selection', () => {
  const wrapper = mount(Ui.UiTable, {
    props: {
      label: 'Custom values',
      rows: [{ id: 'a' }],
      rowKey: () => 'a',
      columns: [{ key: 'virtual', label: 'Computed', value: () => 'Content' }],
      busyLabel: 'Loading',
      emptyLabel: 'Empty',
    },
  })
  expect(wrapper.text()).toContain('Content')
  expect(wrapper.find('input').exists()).toBe(false)
})
it('uses cursor availability without assuming totals and handles numbered boundaries', async () => {
  const wrapper = mount(Ui.UiPagination, {
    props: {
      state: { kind: 'cursor', hasPrevious: false, hasNext: true },
      label: 'Navigation',
      previousLabel: 'Previous',
      nextLabel: 'Next',
    },
  })
  expect(wrapper.findAll('button')[0]!.element.disabled).toBe(true)
  await wrapper.findAll('button')[1]!.trigger('click')
  expect(wrapper.emitted('navigate')?.at(-1)).toEqual(['next'])
  await wrapper.setProps({ state: { kind: 'cursor', hasPrevious: true, hasNext: false } })
  await wrapper.findAll('button')[0]!.trigger('click')
  expect(wrapper.emitted('navigate')?.at(-1)).toEqual(['previous'])
  await wrapper.setProps({ state: { kind: 'pages', page: 2, pageCount: 3 } })
  await wrapper.findAll('button')[0]!.trigger('click')
  expect(wrapper.emitted('navigate')?.at(-1)).toEqual([1])
  await wrapper.findAll('button')[1]!.trigger('click')
  expect(wrapper.emitted('navigate')?.at(-1)).toEqual([3])
  expect(wrapper.text()).toContain('2 / 3')
  await wrapper.setProps({ state: { kind: 'pages', page: 1, pageCount: 1 }, busy: true })
  expect(wrapper.findAll('button').every((b) => b.element.disabled)).toBe(true)
})
it('renders equivalent data for line, bar and share charts, rejecting missing/invalid shares', async () => {
  const points = [
    { label: 'Alpha', value: 12 },
    { label: 'Beta', value: 4 },
  ]
  const wrapper = mount(Ui.UiChart, {
    props: {
      label: 'Values',
      kind: 'line',
      points,
      unit: '%',
      emptyLabel: 'No data',
      dataLabel: 'Data table',
    },
  })
  expect(wrapper.get('table').text()).toContain('Alpha12%')
  expect(wrapper.get('polyline').attributes('points')).not.toContain('NaN')
  await wrapper.setProps({ kind: 'bar' })
  expect(wrapper.findAll('rect')).toHaveLength(2)
  await wrapper.setProps({ kind: 'donut' })
  expect(wrapper.findAll('circle')).toHaveLength(2)
  await wrapper.setProps({ points: [{ label: 'Zero', value: 0 }] })
  expect(wrapper.get('[role=status]').text()).toBe('No data')
  await wrapper.setProps({ points: [{ label: 'Bad', value: NaN }] })
  expect(wrapper.find('svg').exists()).toBe(false)
  await wrapper.setProps({ points: [] })
  expect(wrapper.find('svg').exists()).toBe(false)
  await wrapper.setProps({ kind: 'line', points: [{ label: 'Single', value: 0 }] })
  expect(wrapper.get('polyline').attributes('points')).not.toContain('NaN')
})
