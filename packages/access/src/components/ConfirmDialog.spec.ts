import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmDialog from './ConfirmDialog.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(ConfirmDialog, {
    props: {
      open: true,
      titleKey: 'access.identities.confirm.delete.title',
      messageKey: 'access.identities.confirm.delete.message',
      confirmKey: 'access.identities.confirm.delete.confirm',
      ...props,
    },
  })
}

describe('ConfirmDialog', () => {
  it('renders as an alertdialog labelled by its title', () => {
    const w = mountDialog()
    const panel = w.find('.modal__panel')
    expect(panel.attributes('role')).toBe('alertdialog')
    expect(panel.attributes('aria-labelledby')).toBe('confirm-dialog-title')
    expect(panel.attributes('aria-describedby')).toBe('confirm-dialog-message')
    expect(w.find('#confirm-dialog-title').text()).toBe('access.identities.confirm.delete.title')
    expect(w.find('#confirm-dialog-message').exists()).toBe(true)
  })

  it('emits confirm when the confirm button is clicked', async () => {
    const w = mountDialog()
    const buttons = w.findAll('.confirm__btn')
    await buttons[buttons.length - 1]!.trigger('click')
    expect(w.emitted('confirm')).toBeTruthy()
  })

  it('emits cancel when the cancel button is clicked', async () => {
    const w = mountDialog()
    await w.findAll('.confirm__btn')[0]!.trigger('click')
    expect(w.emitted('cancel')).toBeTruthy()
  })

  it('uses the default cancel key, overridable via the cancelKey prop', () => {
    expect(mountDialog().findAll('.confirm__btn')[0]!.text()).toBe(
      'access.identities.confirm.cancel',
    )
    expect(mountDialog({ cancelKey: 'common.cancel' }).findAll('.confirm__btn')[0]!.text()).toBe(
      'common.cancel',
    )
  })

  it('applies the danger style only when danger=true', () => {
    expect(mountDialog({ danger: true }).find('.confirm__btn--danger').exists()).toBe(true)
    expect(mountDialog({ danger: false }).find('.confirm__btn--danger').exists()).toBe(false)
  })

  it('disables the confirm button while busy', () => {
    const w = mountDialog({ busy: true })
    const buttons = w.findAll('.confirm__btn')
    expect(buttons[buttons.length - 1]!.attributes('disabled')).toBeDefined()
    expect(buttons[buttons.length - 1]!.attributes('aria-busy')).toBe('true')
  })

  it('shows an inline server error when errorKey is set', () => {
    const w = mountDialog({ errorKey: 'errors.ERR_INTERNAL' })
    const alert = w.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toBe('errors.ERR_INTERNAL')
  })
})
