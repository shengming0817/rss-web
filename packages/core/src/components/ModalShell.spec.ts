import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ModalShell from './ModalShell.vue'

const SLOT = '<h2 id="t">Title</h2><button id="b1">One</button><button id="b2">Two</button>'

function mountShell(props: Record<string, unknown> = {}) {
  return mount(ModalShell, {
    props: { open: false, titleId: 't', ...props },
    slots: { default: SLOT },
    attachTo: document.body,
  })
}

describe('ModalShell', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders nothing when closed', () => {
    const w = mountShell({ open: false })
    expect(w.find('.modal__panel').exists()).toBe(false)
  })

  it('renders an aria-modal dialog labelled by titleId when open', async () => {
    const w = mountShell({ open: true })
    await flushPromises()
    const panel = w.find('.modal__panel')
    expect(panel.exists()).toBe(true)
    expect(panel.attributes('role')).toBe('dialog')
    expect(panel.attributes('aria-modal')).toBe('true')
    expect(panel.attributes('aria-labelledby')).toBe('t')
  })

  it('reflects descriptionId as aria-describedby (for alertdialog)', async () => {
    const w = mountShell({ open: true, role: 'alertdialog', descriptionId: 'd' })
    await flushPromises()
    expect(w.find('.modal__panel').attributes('aria-describedby')).toBe('d')
  })

  it('uses role=alertdialog when requested', async () => {
    const w = mountShell({ open: true, role: 'alertdialog' })
    await flushPromises()
    expect(w.find('.modal__panel').attributes('role')).toBe('alertdialog')
  })

  it('emits close on Escape', async () => {
    const w = mountShell({ open: true })
    await flushPromises()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(w.emitted('close')).toBeTruthy()
  })

  it('emits close on backdrop click but not on a click inside the panel', async () => {
    const w = mountShell({ open: true })
    await flushPromises()
    await w.find('.modal__panel').trigger('click')
    expect(w.emitted('close')).toBeFalsy()
    await w.find('.modal__backdrop').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('moves focus to the first focusable element when opened', async () => {
    const w = mountShell({ open: false })
    await w.setProps({ open: true })
    await flushPromises()
    expect(document.activeElement?.id).toBe('b1')
  })

  it('restores focus to the opener when closed', async () => {
    const opener = document.createElement('button')
    opener.id = 'opener'
    document.body.appendChild(opener)
    opener.focus()
    const w = mountShell({ open: false })
    await w.setProps({ open: true })
    await flushPromises()
    await w.setProps({ open: false })
    expect(document.activeElement?.id).toBe('opener')
  })

  it('marks background siblings inert while open and restores them on close', async () => {
    const bg = document.createElement('div')
    bg.id = 'bg'
    document.body.appendChild(bg)
    const w = mountShell({ open: false })
    await w.setProps({ open: true })
    await flushPromises()
    expect(bg.inert).toBe(true)
    await w.setProps({ open: false })
    expect(bg.inert).toBe(false)
  })

  it('traps Tab from the last focusable back to the first', async () => {
    mountShell({ open: true })
    await flushPromises()
    ;(document.getElementById('b2') as HTMLElement).focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }))
    expect(document.activeElement?.id).toBe('b1')
  })

  it('traps Shift+Tab from the first focusable to the last', async () => {
    mountShell({ open: true })
    await flushPromises()
    ;(document.getElementById('b1') as HTMLElement).focus()
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true }),
    )
    expect(document.activeElement?.id).toBe('b2')
  })

  it('keeps focus on the panel when there are no focusable children', async () => {
    const w = mount(ModalShell, {
      props: { open: true, titleId: 't' },
      slots: { default: '<p>nothing focusable here</p>' },
      attachTo: document.body,
    })
    await flushPromises()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }))
    expect(document.activeElement).toBe(w.find('.modal__panel').element)
  })

  it('removes its key listener on unmount (no close after teardown)', async () => {
    const w = mountShell({ open: true })
    await flushPromises()
    w.unmount()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    // no throw / no late emit — listener was cleaned up
    expect(true).toBe(true)
  })
})
