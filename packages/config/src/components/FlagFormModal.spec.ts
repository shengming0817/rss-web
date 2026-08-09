import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import FlagFormModal from './FlagFormModal.vue'
import type { FeatureFlag } from '../api/flags'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// Stub ModalShell and RolloutSlider
vi.mock('@gocell/core/components', () => ({
  ModalShell: {
    name: 'ModalShell',
    props: ['open', 'titleId'],
    emits: ['close'],
    template: `<div v-if="open" data-testid="modal-shell"><slot /></div>`,
  },
}))

vi.mock('./RolloutSlider.vue', () => ({
  default: {
    name: 'RolloutSlider',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: `<input type="range" :value="modelValue" @input="$emit('update:modelValue', Number($event.target.value))" />`,
  },
}))

const mkFlag = (over: Partial<FeatureFlag> = {}): FeatureFlag => ({
  id: 'flag-1',
  key: 'audit.chain-verify',
  type: 'boolean',
  enabled: true,
  rolloutPercentage: 75,
  description: 'Enable audit chain verification',
  version: 1,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-02T00:00:00Z',
  ...over,
})

function mountModal(props: Record<string, unknown> = {}) {
  return mount(FlagFormModal, {
    props: {
      open: true,
      flag: null,
      errorKey: null,
      busy: false,
      ...props,
    },
  })
}

describe('FlagFormModal · create mode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders modal shell when open=true', () => {
    const wrapper = mountModal()
    expect(wrapper.find('[data-testid="modal-shell"]').exists()).toBe(true)
  })

  it('does not render modal shell when open=false', () => {
    const wrapper = mountModal({ open: false })
    expect(wrapper.find('[data-testid="modal-shell"]').exists()).toBe(false)
  })

  it('renders an editable key input in create mode', () => {
    const wrapper = mountModal({ flag: null })
    const keyInput = wrapper.find('[data-field="key"]')
    expect(keyInput.exists()).toBe(true)
    expect(keyInput.attributes('readonly')).toBeUndefined()
  })

  it('renders description input', () => {
    const wrapper = mountModal()
    expect(wrapper.find('[data-field="description"]').exists()).toBe(true)
  })

  it('renders RolloutSlider component', () => {
    const wrapper = mountModal()
    expect(wrapper.findComponent({ name: 'RolloutSlider' }).exists()).toBe(true)
  })

  it('renders enabled checkbox/toggle', () => {
    const wrapper = mountModal()
    expect(wrapper.find('[data-field="enabled"]').exists()).toBe(true)
  })

  it('renders variant coming-soon placeholder', () => {
    const wrapper = mountModal()
    expect(wrapper.find('[data-testid="variant-placeholder"]').exists()).toBe(true)
  })
})

describe('FlagFormModal · edit mode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders readonly key input in edit mode', () => {
    const wrapper = mountModal({ flag: mkFlag() })
    const keyInput = wrapper.find('[data-field="key"]')
    expect(keyInput.exists()).toBe(true)
    expect(keyInput.attributes('readonly')).toBeDefined()
  })

  it('pre-fills description from the flag prop', () => {
    const wrapper = mountModal({ flag: mkFlag({ description: 'my description' }) })
    const desc = wrapper.find('[data-field="description"]')
    expect((desc.element as HTMLInputElement | HTMLTextAreaElement).value).toBe('my description')
  })

  it('shows type field as readonly display (not editable)', () => {
    const wrapper = mountModal({ flag: mkFlag({ type: 'boolean' }) })
    const typeDisplay = wrapper.find('[data-testid="flag-type-display"]')
    expect(typeDisplay.exists()).toBe(true)
    expect(typeDisplay.text()).toContain('boolean')
  })
})

describe('FlagFormModal · form submission', () => {
  beforeEach(() => vi.clearAllMocks())

  it('emits submit with create payload when in create mode', async () => {
    const wrapper = mountModal({ flag: null })
    const keyInput = wrapper.find('[data-field="key"]')
    const descInput = wrapper.find('[data-field="description"]')
    await keyInput.setValue('new.flag.key')
    await descInput.setValue('New flag description')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const submitted = wrapper.emitted('submit')
    expect(submitted).toBeTruthy()
    expect(submitted![0]![0]).toMatchObject({ key: 'new.flag.key' })
  })

  it('emits submit with update payload when in edit mode (includes expectedVersion)', async () => {
    const flag = mkFlag({ version: 3 })
    const wrapper = mountModal({ flag })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const submitted = wrapper.emitted('submit')
    expect(submitted).toBeTruthy()
    // Update payload contains expectedVersion
    expect(submitted![0]![0]).toMatchObject({ expectedVersion: 3 })
  })

  it('emits cancel when cancel button is clicked', async () => {
    const wrapper = mountModal()
    await wrapper.find('[data-action="cancel"]').trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })
})

describe('FlagFormModal · validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not emit submit when key is empty in create mode', async () => {
    const wrapper = mountModal({ flag: null })
    // Leave key empty, try to submit
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    // Should show error, not emit submit
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.emitted('submit')).toBeFalsy()
  })
})

describe('FlagFormModal · error display', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows server error with role=alert when errorKey is set', () => {
    const wrapper = mountModal({ errorKey: 'errors.ERR_VERSION_CONFLICT' })
    const alert = wrapper.find('[data-testid="server-error"]')
    expect(alert.exists()).toBe(true)
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toContain('errors.ERR_VERSION_CONFLICT')
  })

  it('disables submit button when busy=true', () => {
    const wrapper = mountModal({ busy: true })
    const submitBtn = wrapper.find('[data-action="submit"]')
    expect(submitBtn.attributes('disabled')).toBeDefined()
  })
})

describe('FlagFormModal · a11y', () => {
  beforeEach(() => vi.clearAllMocks())

  it('key input has associated label', () => {
    const wrapper = mountModal()
    const keyInput = wrapper.find('[data-field="key"]')
    const inputId = keyInput.attributes('id')
    expect(inputId).toBeTruthy()
    const label = wrapper.find(`label[for="${inputId}"]`)
    expect(label.exists()).toBe(true)
  })

  it('description input has associated label', () => {
    const wrapper = mountModal()
    const descInput = wrapper.find('[data-field="description"]')
    const inputId = descInput.attributes('id')
    expect(inputId).toBeTruthy()
    const label = wrapper.find(`label[for="${inputId}"]`)
    expect(label.exists()).toBe(true)
  })
})
