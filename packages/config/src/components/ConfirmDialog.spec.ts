import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmDialog from './ConfirmDialog.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// Stub ModalShell so we can test ConfirmDialog behaviour in isolation
vi.mock('@gocell/core/components', () => ({
  ModalShell: {
    name: 'ModalShell',
    props: ['open', 'titleId', 'descriptionId', 'role'],
    emits: ['close'],
    template: `<div v-if="open" data-testid="modal-shell"><slot /></div>`,
  },
}))

function mountDialog(props: Partial<InstanceType<typeof ConfirmDialog>['$props']> = {}) {
  return mount(ConfirmDialog, {
    props: {
      open: true,
      titleKey: 'config.entries.confirm.publish.title',
      messageKey: 'config.entries.confirm.publish.message',
      confirmKey: 'config.entries.confirm.publish.confirm',
      ...props,
    },
  })
}

describe('ConfirmDialog · rendering', () => {
  it('renders title and message via i18n keys', () => {
    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('config.entries.confirm.publish.title')
    expect(wrapper.text()).toContain('config.entries.confirm.publish.message')
  })

  it('does not render when open=false', () => {
    const wrapper = mountDialog({ open: false })
    expect(wrapper.find('[data-testid="modal-shell"]').exists()).toBe(false)
  })

  it('renders errorKey in role=alert when provided', () => {
    const wrapper = mountDialog({ errorKey: 'errors.ERR_VERSION_CONFLICT' })
    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toBe('errors.ERR_VERSION_CONFLICT')
  })

  it('does NOT render error element when errorKey is null', () => {
    const wrapper = mountDialog({ errorKey: null })
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('ConfirmDialog · cancel button', () => {
  it('uses the default config cancel key when cancelKey not provided', () => {
    const wrapper = mountDialog()
    const buttons = wrapper.findAll('button')
    const cancelBtn = buttons[0]
    expect(cancelBtn?.text()).toBe('config.entries.confirm.cancel')
  })

  it('uses the provided cancelKey', () => {
    const wrapper = mountDialog({ cancelKey: 'config.entries.confirm.abort' })
    const buttons = wrapper.findAll('button')
    const cancelBtn = buttons[0]
    expect(cancelBtn?.text()).toBe('config.entries.confirm.abort')
  })

  it('emits cancel when cancel button is clicked', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('button')[0]?.trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })
})

describe('ConfirmDialog · default slot', () => {
  it('renders slot content between message and error sections', () => {
    const wrapper = mount(ConfirmDialog, {
      props: {
        open: true,
        titleKey: 'config.entries.confirm.rollback.title',
        messageKey: 'config.entries.confirm.rollback.message',
        confirmKey: 'config.entries.confirm.rollback.confirm',
      },
      slots: {
        default: '<input data-testid="slot-input" type="number" value="2" />',
      },
    })
    expect(wrapper.find('[data-testid="slot-input"]').exists()).toBe(true)
  })

  it('renders no slot content when nothing is passed', () => {
    const wrapper = mountDialog()
    // The <slot /> element renders empty — no extra DOM between message and error
    expect(wrapper.find('[data-testid="slot-input"]').exists()).toBe(false)
  })
})

describe('ConfirmDialog · confirm button', () => {
  it('emits confirm when confirm button is clicked', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('button')[1]?.trigger('click')
    expect(wrapper.emitted('confirm')).toBeTruthy()
  })

  it('confirm button is disabled and aria-busy when busy=true', () => {
    const wrapper = mountDialog({ busy: true })
    const confirmBtn = wrapper.findAll('button')[1]
    expect(confirmBtn?.attributes('disabled')).toBeDefined()
    expect(confirmBtn?.attributes('aria-busy')).toBe('true')
  })

  it('applies danger class when danger=true', () => {
    const wrapper = mountDialog({ danger: true })
    const confirmBtn = wrapper.findAll('button')[1]
    expect(confirmBtn?.classes()).toContain('confirm__btn--danger')
  })

  it('applies primary class when danger=false', () => {
    const wrapper = mountDialog({ danger: false })
    const confirmBtn = wrapper.findAll('button')[1]
    expect(confirmBtn?.classes()).toContain('confirm__btn--primary')
  })
})
