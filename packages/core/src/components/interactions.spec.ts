import './__tests__/setup'
import { expect, it, vi } from 'vitest'
import { mount, flushPromises, DOMWrapper } from '@vue/test-utils'
import { defineComponent, ref, toRaw } from 'vue'
import { DialogContent } from 'reka-ui'
import * as Ui from './index'
const body = () => new DOMWrapper(document.body)
const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma', disabled: true },
]

it('uses native button semantics and suppresses activation while busy', async () => {
  const wrapper = mount(Ui.UiButton, { props: { type: 'submit' }, slots: { default: 'Save' } })
  expect(wrapper.get('button').attributes('type')).toBe('submit')
  await wrapper.get('button').trigger('click')
  expect(wrapper.emitted('click')).toHaveLength(1)
  await wrapper.setProps({ busy: true, variant: 'primary' })
  wrapper.get('button').element.click()
  expect(wrapper.emitted('click')).toHaveLength(1)
  expect(wrapper.get('button').attributes('aria-busy')).toBe('true')
})
it('toggles a switch through its accessible control', async () => {
  const wrapper = mount(Ui.UiSwitch, { props: { label: 'Enable', modelValue: false } })
  expect(wrapper.get('[role=switch]').attributes('aria-checked')).toBe('false')
  await wrapper.get('[role=switch]').trigger('click')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true])
  await wrapper.setProps({ modelValue: true, disabled: true })
  expect(wrapper.get('[role=switch]').attributes('aria-checked')).toBe('true')
})
it('associates tabs and panels and keeps a disabled destination unavailable', async () => {
  const wrapper = mount(Ui.UiTabs, {
    attachTo: document.body,
    props: { modelValue: 'a', items: options, label: 'Views' },
    slots: { a: 'Alpha content', b: 'Beta content' },
  })
  expect(wrapper.get('[role=tabpanel][data-state=active]').text()).toBe('Alpha content')
  await wrapper.findAll('[role=tab]')[1]!.trigger('mousedown', { button: 0, ctrlKey: false })
  await wrapper.findAll('[role=tab]')[1]!.trigger('click')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['b'])
  await wrapper.setProps({ modelValue: 'b' })
  expect(wrapper.get('[role=tabpanel][data-state=active]').text()).toBe('Beta content')
  expect(wrapper.findAll('[role=tab]')[2]!.attributes('disabled')).toBeDefined()
})
it('emits navigation intentions and renders the current breadcrumb without a link', async () => {
  const nav = mount(Ui.UiNavList, { props: { label: 'Navigation', items: options, current: 'a' } })
  expect(nav.get('[aria-current=page]').text()).toBe('Alpha')
  await nav.findAll('button')[1]!.trigger('click')
  expect(nav.emitted('select')?.at(-1)).toEqual(['b'])
  const crumbs = mount(Ui.UiBreadcrumb, {
    props: {
      label: 'Location',
      items: [
        { label: 'Home', href: '/' },
        { label: 'Parent' },
        { label: 'Current', href: '/current' },
      ],
    },
  })
  expect(crumbs.findAll('a')).toHaveLength(1)
  expect(crumbs.get('[aria-current=page]').text()).toBe('Current')
})
it('opens disclosure content and supports controlled collapse', async () => {
  const wrapper = mount(Ui.UiDisclosure, {
    props: { label: 'Details', open: false },
    slots: { default: 'More content' },
  })
  await wrapper.get('button').trigger('click')
  expect(wrapper.emitted('update:open')?.at(-1)).toEqual([true])
  await wrapper.setProps({ open: true })
  expect(wrapper.text()).toContain('More content')
  await wrapper.get('button').trigger('click')
  expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
})
it('searches a combobox and reports selection without fetching data', async () => {
  const wrapper = mount(Ui.UiCombobox, {
    attachTo: document.body,
    props: {
      label: 'Choose',
      modelValue: 'a',
      options,
      invalidLabel: 'Select an option',
      emptyLabel: 'No matches',
    },
  })
  await flushPromises()
  expect(wrapper.get('input').element.value).toBe('Alpha')
  await wrapper.get('input').setValue('Beta')
  await flushPromises()
  const item = body()
    .findAll('[role=option]')
    .find((option) => option.text().includes('Beta'))!
  await item.trigger('click')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['b'])
  await wrapper.setProps({ modelValue: 'missing', invalid: true })
  await flushPromises()
  expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
  await wrapper.get('input').setValue('Unmatched')
  await flushPromises()
  expect(document.body.textContent).toContain('No matches')
})
it('opens a keyboard menu and reports an enabled action', async () => {
  const wrapper = mount(Ui.UiMenu, {
    attachTo: document.body,
    props: { label: 'Actions', items: options },
  })
  await wrapper.get('button').trigger('keydown', { key: 'Enter' })
  await flushPromises()
  expect(body().find('[role=menu]').exists()).toBe(true)
  const items = body().findAll('[role=menuitem]')
  expect(items[2]!.attributes('data-disabled')).toBeDefined()
  await items[1]!.trigger('click')
  expect(wrapper.emitted('select')?.at(-1)).toEqual(['b'])
})
it('uses a popover to expose content and a localized close control', async () => {
  const wrapper = mount(Ui.UiPopover, {
    attachTo: document.body,
    props: { label: 'Open', closeLabel: 'Close', open: true },
    slots: { default: 'Popover content' },
  })
  await flushPromises()
  expect(document.body.textContent).toContain('Popover content')
  const close = body()
    .findAll('button')
    .find((button) => button.text() === 'Close')!
  await close.trigger('click')
  expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
})
it('exposes a tooltip to keyboard users', async () => {
  const wrapper = mount(Ui.UiTooltip, {
    attachTo: document.body,
    props: { label: 'Additional help' },
    slots: { default: '<button>Help</button>' },
  })
  wrapper.get('button').element.focus()
  await flushPromises()
  expect(body().get('[role=tooltip]').text()).toBe('Additional help')
})
it('returns a controlled dialog to its external opener and cleans background isolation', async () => {
  const opener = document.createElement('button')
  opener.textContent = 'Open'
  document.body.append(opener)
  opener.focus()
  const wrapper = mount(Ui.UiDialog, {
    attachTo: document.body,
    props: { open: true, title: 'Title', description: 'Description', closeLabel: 'Close' },
    slots: { default: '<label>Input<input /></label>', footer: '<button>Cancel</button>' },
  })
  await flushPromises()
  const dialog = body().get('[role=dialog]')
  expect(dialog.text()).toContain('Title')
  expect(document.getElementById(dialog.attributes('aria-describedby') ?? '')?.textContent).toBe(
    'Description',
  )
  expect(dialog.element.contains(document.activeElement)).toBe(true)
  expect(opener.getAttribute('aria-hidden')).toBe('true')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flushPromises()
  expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
  await wrapper.setProps({ open: false })
  await flushPromises()
  expect(document.activeElement).toBe(opener)
  expect(opener.getAttribute('aria-hidden')).toBeNull()
})
it('prevents outside dismissal for confirmation and honors explicit dismissal locks', async () => {
  const wrapper = mount(Ui.UiDialog, {
    attachTo: document.body,
    props: {
      open: true,
      title: 'Confirm',
      closeLabel: 'Cancel',
      kind: 'alertdialog',
      placement: 'right',
      dismissible: false,
    },
    slots: { default: '<button>Continue</button>' },
  })
  await flushPromises()
  expect(body().get('[role=alertdialog]').attributes('aria-describedby')).toBeUndefined()
  const outside = new Event('outside', { cancelable: true })
  wrapper.findComponent(DialogContent).vm.$emit('pointerDownOutside', outside)
  expect(outside.defaultPrevented).toBe(true)
  const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
  wrapper.findComponent(DialogContent).vm.$emit('escapeKeyDown', escape)
  expect(escape.defaultPrevented).toBe(true)
  await wrapper.setProps({ kind: 'dialog', dismissible: true })
  const allowed = new Event('outside', { cancelable: true })
  wrapper.findComponent(DialogContent).vm.$emit('pointerDownOutside', allowed)
  expect(allowed.defaultPrevented).toBe(false)
  await body()
    .findAll('button')
    .find((button) => button.attributes('aria-label') === 'Cancel')!
    .trigger('click')
  expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
})
it('closes only the top nested dialog and returns focus to the parent', async () => {
  const wrapper = mount(
    defineComponent({
      components: { UiDialog: Ui.UiDialog },
      setup() {
        return { outer: ref(true), inner: ref(false) }
      },
      template:
        '<UiDialog v-model:open="outer" title="Outer" close-label="Close outer"><button id="open-inner" @click="inner = true">Inner</button><UiDialog v-model:open="inner" title="Inner" close-label="Close inner"><input aria-label="Nested input" /></UiDialog></UiDialog>',
    }),
    { attachTo: document.body },
  )
  await flushPromises()
  const trigger = body().get('#open-inner')
  ;(trigger.element as HTMLElement).focus()
  await trigger.trigger('click')
  await flushPromises()
  expect(body().findAll('[role=dialog]')).toHaveLength(2)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flushPromises()
  expect(body().findAll('[role=dialog]')).toHaveLength(1)
  expect(document.activeElement?.id).toBe('open-inner')
  wrapper.unmount()
  await flushPromises()
  expect(document.querySelector('[role=dialog]')).toBeNull()
})
it('closes notifications through the owner instead of mutating a global store', async () => {
  const wrapper = mount(Ui.UiToastRegion, {
    attachTo: document.body,
    props: {
      label: 'Notifications',
      closeLabel: 'Dismiss',
      notices: [
        { id: 'one', title: 'Saved', description: 'Details', tone: 'success' },
        { id: 'two', title: 'Next' },
      ],
      duration: 60000,
    },
  })
  await flushPromises()
  const close = body()
    .findAll('button')
    .filter((button) => button.attributes('aria-label') === 'Dismiss')
  expect(close).toHaveLength(2)
  await close[0]!.trigger('click')
  expect(wrapper.emitted('dismiss')?.at(-1)).toEqual(['one'])
})

it('keeps link semantics, external isolation and disabled activation explicit', async () => {
  const wrapper = mount(Ui.UiLink, {
    props: { href: '#destination', target: '_blank' },
    slots: { default: 'Destination' },
  })
  expect(wrapper.get('a').attributes('rel')).toBe('noopener noreferrer')
  await wrapper.get('a').trigger('click')
  expect(wrapper.emitted('click')).toHaveLength(1)
  await wrapper.setProps({ disabled: true, target: '_self' })
  expect(wrapper.get('a').attributes('href')).toBeUndefined()
  expect(wrapper.get('a').attributes('aria-disabled')).toBe('true')
  await wrapper.get('a').trigger('click')
  expect(wrapper.emitted('click')).toHaveLength(1)
})

it('releases toast close timers on explicit dismissal and early region unmount', async () => {
  const scheduled = vi.spyOn(window, 'setTimeout')
  const cleared = vi.spyOn(window, 'clearTimeout')
  const wrapper = mount(Ui.UiToastRegion, {
    attachTo: document.body,
    props: {
      label: 'Notifications',
      closeLabel: 'Dismiss',
      duration: 60000,
      notices: [
        { id: 'one', title: 'First' },
        { id: 'two', title: 'Second' },
      ],
    },
  })
  await flushPromises()
  const handles = scheduled.mock.calls.flatMap((call, index) =>
    call[1] === 60000 ? [scheduled.mock.results[index]!.value as number] : [],
  )
  expect(handles.length).toBeGreaterThanOrEqual(2)
  const beforeDismiss = cleared.mock.calls.length
  await body()
    .findAll('button')
    .find((button) => button.attributes('aria-label') === 'Dismiss')!
    .trigger('click')
  expect(cleared.mock.calls.length).toBeGreaterThan(beforeDismiss)
  wrapper.unmount()
  await flushPromises()
  for (const handle of handles)
    expect(cleared.mock.calls.some(([value]) => toRaw(value) === toRaw(handle))).toBe(true)
})

it.each(['selection', ''])(
  'validates the selected combobox value with form name %s',
  async (name) => {
    const form = document.createElement('form')
    document.body.append(form)
    const wrapper = mount(Ui.UiCombobox, {
      attachTo: form,
      props: {
        label: 'Choose',
        modelValue: '',
        options,
        emptyLabel: 'Empty',
        invalidLabel: 'Select an option',
        required: true,
        ...(name ? { name } : {}),
      },
    })
    await flushPromises()
    expect(form.checkValidity()).toBe(false)
    await wrapper.get('input[role=combobox]').setValue('no-such-option')
    await flushPromises()
    expect(form.checkValidity()).toBe(false)
    if (name) expect(new FormData(form).get(name)).toBe('')
    await wrapper.setProps({ modelValue: 'b' })
    await flushPromises()
    expect(form.checkValidity()).toBe(true)
    if (name) expect(new FormData(form).get(name)).toBe('b')
    await wrapper.get('input[role=combobox]').setValue('')
    await flushPromises()
    expect(form.checkValidity()).toBe(true)
    if (name) expect(new FormData(form).get(name)).toBe('b')
    await wrapper.setProps({ modelValue: '', required: false })
    await flushPromises()
    expect(form.checkValidity()).toBe(true)
  },
)

it('keeps readonly comboboxes focusable, closes an open popup, and prevents selection changes', async () => {
  const form = document.createElement('form')
  document.body.append(form)
  const wrapper = mount(Ui.UiCombobox, {
    attachTo: form,
    props: {
      label: 'Choose',
      modelValue: 'a',
      name: 'selection',
      options,
      emptyLabel: 'Empty',
      invalidLabel: 'Select an option',
    },
  })
  await wrapper.get('input').trigger('focus')
  await flushPromises()
  expect(body().find('[role=option]').exists()).toBe(true)
  await wrapper.get('input[role=combobox]').setValue('Beta')
  await wrapper.setProps({ readonly: true })
  await flushPromises()
  expect(body().find('[role=option]').exists()).toBe(false)
  const input = wrapper.get<HTMLInputElement>('input[role=combobox]')
  expect(input.element.readOnly).toBe(true)
  expect(input.element.value).toBe('Alpha')
  expect(input.element.disabled).toBe(false)
  input.element.focus()
  expect(document.activeElement).toBe(input.element)
  await input.trigger('keydown', { key: 'ArrowDown' })
  await input.trigger('keydown', { key: 'Enter' })
  wrapper.get('button').element.click()
  await flushPromises()
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(new FormData(form).get('selection')).toBe('a')
  expect(input.attributes('aria-expanded')).toBe('false')
  await wrapper.setProps({ modelValue: 'b' })
  await flushPromises()
  expect(input.element.value).toBe('Beta')
  expect(new FormData(form).get('selection')).toBe('b')
  await wrapper.setProps({ modelValue: 'a' })
  await wrapper.setProps({ readonly: false })
  await flushPromises()
  expect(input.attributes('aria-expanded')).toBe('false')
  await wrapper.get('button').trigger('click')
  await flushPromises()
  await body()
    .findAll('[role=option]')
    .find((item) => item.text().includes('Beta'))!
    .trigger('click')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['b'])
})
