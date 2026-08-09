import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ConfigEditDrawer from './ConfigEditDrawer.vue'
import type { ConfigEntry } from '../api/config'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

vi.mock('@gocell/core/components', () => ({
  ModalShell: {
    name: 'ModalShell',
    props: ['open', 'titleId', 'role'],
    emits: ['close'],
    template: `<div v-if="open" data-testid="modal-shell"><slot /></div>`,
  },
}))

const mkEntry = (over: Partial<ConfigEntry> = {}): ConfigEntry => ({
  id: 'cfg-1',
  key: 'app.debug',
  value: 'true',
  sensitive: false,
  version: 2,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-02T00:00:00Z',
  ...over,
})

function mountDrawer(props: Partial<InstanceType<typeof ConfigEditDrawer>['$props']> = {}) {
  return mount(ConfigEditDrawer, {
    props: {
      open: true,
      ...props,
    },
  })
}

describe('ConfigEditDrawer · a11y (label-input associations)', () => {
  it('key input is associated with its label via for/id', () => {
    const wrapper = mountDrawer()
    expect(wrapper.find('label[for="config-edit-key"]').exists()).toBe(true)
    expect(wrapper.find('#config-edit-key').exists()).toBe(true)
  })

  it('value input is associated with its label via for/id', () => {
    const wrapper = mountDrawer()
    expect(wrapper.find('label[for="config-edit-value"]').exists()).toBe(true)
    expect(wrapper.find('#config-edit-value').exists()).toBe(true)
  })

  it('sensitive checkbox is associated with its label via for/id (create mode)', () => {
    const wrapper = mountDrawer()
    expect(wrapper.find('label[for="config-edit-sensitive"]').exists()).toBe(true)
    expect(wrapper.find('#config-edit-sensitive').exists()).toBe(true)
  })

  it('sensitive checkbox is hidden in edit mode', () => {
    const wrapper = mountDrawer({ entry: mkEntry() })
    expect(wrapper.find('#config-edit-sensitive').exists()).toBe(false)
  })
})

describe('ConfigEditDrawer · create mode', () => {
  it('renders create title key', () => {
    const wrapper = mountDrawer()
    expect(wrapper.text()).toContain('config.entries.drawer.createTitle')
  })

  it('key input is editable in create mode', () => {
    const wrapper = mountDrawer()
    const keyInput = wrapper.get('#config-edit-key')
    expect(keyInput.attributes('readonly')).toBeUndefined()
  })

  it('emits submit with CreatePayload on valid create form', async () => {
    const wrapper = mountDrawer()
    await wrapper.get('#config-edit-key').setValue('new.key')
    await wrapper.get('#config-edit-value').setValue('new-value')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const submitted = wrapper.emitted('submit')
    expect(submitted).toBeTruthy()
    expect(submitted?.[0]?.[0]).toMatchObject({ key: 'new.key', value: 'new-value' })
  })

  it('shows key validation error when key is empty on submit', async () => {
    const wrapper = mountDrawer()
    await wrapper.get('#config-edit-key').setValue('')
    await wrapper.get('#config-edit-value').setValue('v')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const keyError = wrapper.find('#config-edit-key-error')
    expect(keyError.exists()).toBe(true)
    expect(keyError.attributes('role')).toBe('alert')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('shows value validation error when value is empty on submit', async () => {
    const wrapper = mountDrawer()
    await wrapper.get('#config-edit-key').setValue('app.name')
    await wrapper.get('#config-edit-value').setValue('')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const valueError = wrapper.find('#config-edit-value-error')
    expect(valueError.exists()).toBe(true)
    expect(valueError.attributes('role')).toBe('alert')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('does NOT submit when value is the redacted placeholder', async () => {
    const wrapper = mountDrawer()
    await wrapper.get('#config-edit-key').setValue('secret')
    await wrapper.get('#config-edit-value').setValue('******')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.emitted('submit')).toBeFalsy()
    const valueError = wrapper.find('#config-edit-value-error')
    expect(valueError.exists()).toBe(true)
  })

  it('key input has aria-invalid and aria-describedby when key error shown', async () => {
    const wrapper = mountDrawer()
    await wrapper.get('#config-edit-key').setValue('')
    await wrapper.get('#config-edit-value').setValue('v')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const keyInput = wrapper.get('#config-edit-key')
    expect(keyInput.attributes('aria-invalid')).toBe('true')
    expect(keyInput.attributes('aria-describedby')).toBe('config-edit-key-error')
  })
})

describe('ConfigEditDrawer · edit mode', () => {
  it('renders edit title key', () => {
    const wrapper = mountDrawer({ entry: mkEntry() })
    expect(wrapper.text()).toContain('config.entries.drawer.editTitle')
  })

  it('key input is readonly in edit mode', () => {
    const wrapper = mountDrawer({ entry: mkEntry() })
    const keyInput = wrapper.get('#config-edit-key')
    expect(keyInput.attributes('readonly')).toBeDefined()
  })

  it('pre-fills key from entry', () => {
    const wrapper = mountDrawer({ entry: mkEntry({ key: 'app.debug' }) })
    const keyInput = wrapper.get('#config-edit-key')
    expect((keyInput.element as HTMLInputElement).value).toBe('app.debug')
  })

  it('emits submit with UpdatePayload containing expectedVersion on valid edit', async () => {
    const entry = mkEntry({ key: 'app.debug', version: 3 })
    const wrapper = mountDrawer({ entry })
    await wrapper.get('#config-edit-value').setValue('false')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const submitted = wrapper.emitted('submit')
    expect(submitted?.[0]?.[0]).toMatchObject({
      key: 'app.debug',
      body: { value: 'false', expectedVersion: 3 },
    })
  })
})

describe('ConfigEditDrawer · sensitive entry edit', () => {
  const sensitiveEntry = mkEntry({ sensitive: true, value: '******' })

  it('leaves value blank when editing a sensitive entry', () => {
    const wrapper = mountDrawer({ entry: sensitiveEntry })
    const valueInput = wrapper.get('#config-edit-value')
    expect((valueInput.element as HTMLInputElement).value).toBe('')
  })

  it('shows sensitive badge on the value label', () => {
    const wrapper = mountDrawer({ entry: sensitiveEntry })
    expect(wrapper.find('.drawer__sensitive-badge').exists()).toBe(true)
    expect(wrapper.find('.drawer__sensitive-badge').text()).toBe(
      'config.entries.drawer.value.sensitiveLabel',
    )
  })

  it('shows sensitive hint below the value input', () => {
    const wrapper = mountDrawer({ entry: sensitiveEntry })
    expect(wrapper.find('.drawer__hint').exists()).toBe(true)
  })

  it('requires a non-empty value even for sensitive entries', async () => {
    const wrapper = mountDrawer({ entry: sensitiveEntry })
    // value is blank — submitting should fail validation
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.find('#config-edit-value-error').exists()).toBe(true)
  })
})

describe('ConfigEditDrawer · error display', () => {
  it('renders errorKey in role=alert when provided', () => {
    const wrapper = mountDrawer({ errorKey: 'errors.ERR_VERSION_CONFLICT' })
    const alerts = wrapper.findAll('[role="alert"]')
    expect(alerts.some((a) => a.text().includes('errors.ERR_VERSION_CONFLICT'))).toBe(true)
  })

  it('does not render alert when errorKey is null', () => {
    const wrapper = mountDrawer({ errorKey: null })
    // No server error alerts (only validation alerts from submitted form)
    const alerts = wrapper.findAll('[role="alert"]')
    expect(alerts.length).toBe(0)
  })
})

describe('ConfigEditDrawer · cancel', () => {
  it('emits cancel when cancel button is clicked', async () => {
    const wrapper = mountDrawer()
    await wrapper.get('button[type="button"]').trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  it('submit button is disabled and aria-busy when busy=true', () => {
    const wrapper = mountDrawer({ busy: true })
    const submitBtn = wrapper.get('button[type="submit"]')
    expect(submitBtn.attributes('disabled')).toBeDefined()
    expect(submitBtn.attributes('aria-busy')).toBe('true')
  })
})

describe('ConfigEditDrawer · stage hint', () => {
  it('renders the stage warning strip', () => {
    const wrapper = mountDrawer()
    const hint = wrapper.find('.drawer__stage-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('config.entries.drawer.stageHint')
  })
})
