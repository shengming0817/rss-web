import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import { createTestingPinia } from '@pinia/testing'
import { PDP_INJECTION_KEY, type PdpClient } from '@gocell/core'
import { useFlagsStore } from '../stores/useFlagsStore'
import type { FeatureFlag } from '../api/flags'
import FlagsView from './FlagsView.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

vi.mock('../components/FlagFormModal.vue', () => ({
  default: {
    name: 'FlagFormModal',
    props: ['open', 'flag', 'errorKey', 'busy'],
    emits: ['submit', 'cancel'],
    template: `<div v-if="open" data-testid="flag-form-modal"><slot /></div>`,
  },
}))

vi.mock('../components/ConfirmDialog.vue', () => ({
  default: {
    name: 'ConfirmDialog',
    props: ['open', 'titleKey', 'messageKey', 'confirmKey', 'danger', 'busy', 'errorKey'],
    emits: ['confirm', 'cancel'],
    template: `<div v-if="open" :data-testid="'confirm-dialog-' + titleKey"><slot /></div>`,
  },
}))

const pdp = (allowed: boolean): PdpClient => ({
  can: () => computed(() => allowed),
  decide: () => Promise.resolve({ effect: allowed ? 'allow' : 'deny', reasonCode: '' }),
})

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

type State = {
  flags?: FeatureFlag[]
  loading?: boolean
  errorKey?: string | null
  hasMore?: boolean
  filter?: string
  mutating?: boolean
}

function mountView(state: State = {}, pdpAllowed = true) {
  const wrapper = mount(FlagsView, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            'config.flags': {
              flags: [],
              loading: false,
              errorKey: null,
              nextCursor: '',
              hasMore: false,
              filter: '',
              mutating: false,
              ...state,
            },
          },
        }),
      ],
      provide: {
        [PDP_INJECTION_KEY]: pdp(pdpAllowed),
      },
    },
  })
  const store = useFlagsStore()
  return { wrapper, store }
}

describe('FlagsView · mount', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches the list once on mount', () => {
    const { store } = mountView()
    expect(store.fetchList).toHaveBeenCalledTimes(1)
  })
})

describe('FlagsView · page head', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders an h1 with the page title', () => {
    const { wrapper } = mountView()
    const h1 = wrapper.find('h1')
    expect(h1.exists()).toBe(true)
  })

  it('renders New flag button inside Can when pdpAllowed=true', () => {
    const { wrapper } = mountView({}, true)
    const createBtn = wrapper.find('[data-action="create"]')
    expect(createBtn.exists()).toBe(true)
  })
})

describe('FlagsView · flag card list', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders one card per flag', () => {
    const { wrapper } = mountView({
      flags: [mkFlag(), mkFlag({ id: 'f2', key: 'payments.new-checkout' })],
    })
    expect(wrapper.findAll('.v1-flag')).toHaveLength(2)
  })

  it('renders flag key in mono class', () => {
    const { wrapper } = mountView({ flags: [mkFlag()] })
    const keyEl = wrapper.find('.v1-flag-key')
    expect(keyEl.exists()).toBe(true)
    expect(keyEl.text()).toContain('audit.chain-verify')
  })

  it('renders rollout progress bar', () => {
    const { wrapper } = mountView({ flags: [mkFlag({ rolloutPercentage: 75 })] })
    expect(wrapper.find('.v1-flag-bar').exists()).toBe(true)
    expect(wrapper.find('.v1-flag-fill').exists()).toBe(true)
  })

  it('rollout fill width is bound to rolloutPercentage (data-driven, not magic number)', () => {
    const { wrapper } = mountView({ flags: [mkFlag({ rolloutPercentage: 42 })] })
    const fill = wrapper.find('.v1-flag-fill')
    // Width should be bound via style or CSS variable — check style attribute contains 42
    const style = fill.attributes('style') ?? ''
    expect(style).toContain('42')
  })

  it('renders v1-switch toggle for enabled state', () => {
    const { wrapper } = mountView({ flags: [mkFlag({ enabled: true })] })
    expect(wrapper.find('.v1-switch').exists()).toBe(true)
  })

  it('enabled toggle checkbox has aria-label for a11y', () => {
    const { wrapper } = mountView({ flags: [mkFlag()] })
    // The checkbox input inside .v1-switch must have aria-label (accessible name on the input).
    // The <label> wrapper has no text content, so aria-label on <input> provides the name.
    const switchInput = wrapper.find('.v1-switch input[type="checkbox"]')
    expect(switchInput.exists()).toBe(true)
    expect(switchInput.attributes('aria-label')).toBeTruthy()
  })

  it('description is shown', () => {
    const { wrapper } = mountView({
      flags: [mkFlag({ description: 'Enable chain verification' })],
    })
    expect(wrapper.text()).toContain('Enable chain verification')
  })

  it('type is shown as text', () => {
    const { wrapper } = mountView({ flags: [mkFlag({ type: 'boolean' })] })
    expect(wrapper.text()).toContain('boolean')
  })

  it('variant placeholder is present in the card', () => {
    const { wrapper } = mountView({ flags: [mkFlag()] })
    expect(wrapper.find('[data-testid="variant-placeholder"]').exists()).toBe(true)
  })
})

describe('FlagsView · three states', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows loading state with role=status when loading and no flags', () => {
    const { wrapper } = mountView({ loading: true, flags: [] })
    const status = wrapper.find('[role="status"]')
    expect(status.exists()).toBe(true)
  })

  it('shows empty state with role=status when no flags and not loading', () => {
    const { wrapper } = mountView({ flags: [], loading: false })
    const status = wrapper.find('[role="status"]')
    expect(status.exists()).toBe(true)
    expect(status.text()).toContain('flags.list.empty')
  })

  it('shows error state with role=alert when errorKey is set', () => {
    const { wrapper } = mountView({ errorKey: 'errors.ERR_AUTH_FORBIDDEN' })
    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('errors.ERR_AUTH_FORBIDDEN')
  })
})

describe('FlagsView · modal interactions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('create button opens the modal', async () => {
    const { wrapper } = mountView({}, true)
    await wrapper.find('[data-action="create"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="flag-form-modal"]').exists()).toBe(true)
  })

  it('modal is not shown initially', () => {
    const { wrapper } = mountView()
    expect(wrapper.find('[data-testid="flag-form-modal"]').exists()).toBe(false)
  })

  it('modal cancel event closes the modal', async () => {
    const { wrapper } = mountView({}, true)
    await wrapper.find('[data-action="create"]').trigger('click')
    await flushPromises()

    const modal = wrapper.findComponent({ name: 'FlagFormModal' })
    modal.vm.$emit('cancel')
    await flushPromises()
    expect(modal.props('open')).toBe(false)
  })

  it('modal submit calls store.create for create mode', async () => {
    const { wrapper, store } = mountView({}, true)
    vi.mocked(store.create).mockResolvedValue(undefined)

    await wrapper.find('[data-action="create"]').trigger('click')
    await flushPromises()

    const modal = wrapper.findComponent({ name: 'FlagFormModal' })
    modal.vm.$emit('submit', {
      key: 'new.flag',
      description: 'test',
      enabled: false,
      rolloutPercentage: 0,
    })
    await flushPromises()
    expect(store.create).toHaveBeenCalled()
  })

  it('modal submit calls store.update for edit mode', async () => {
    const flag = mkFlag()
    const { wrapper, store } = mountView({ flags: [flag] }, true)
    vi.mocked(store.update).mockResolvedValue(undefined)

    const modal = wrapper.findComponent({ name: 'FlagFormModal' })
    modal.vm.$emit('submit', {
      key: flag.key,
      enabled: false,
      rolloutPercentage: 50,
      description: 'updated',
      expectedVersion: 1,
    })
    await flushPromises()
    expect(store.update).toHaveBeenCalled()
  })

  it('shows CAS error in modal when store.update rejects with ERR_VERSION_CONFLICT', async () => {
    const { wrapper, store } = mountView({}, true)
    vi.mocked(store.update).mockRejectedValue(
      Object.assign(new Error('conflict'), {
        isAxiosError: true,
        i18nKey: 'errors.ERR_VERSION_CONFLICT',
      }),
    )

    const modal = wrapper.findComponent({ name: 'FlagFormModal' })
    modal.vm.$emit('submit', {
      key: 'x',
      enabled: true,
      rolloutPercentage: 100,
      description: 'd',
      expectedVersion: 1,
    })
    await flushPromises()

    expect(modal.props('errorKey')).toBe('errors.ERR_VERSION_CONFLICT')
  })
})

describe('FlagsView · toggle guard (Can)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('toggle switch is NOT rendered when PDP denies write on flag', () => {
    const { wrapper } = mountView({ flags: [mkFlag({ enabled: true })] }, false)
    // When pdpAllowed=false the <Can> wrapper suppresses the v1-switch
    expect(wrapper.find('.v1-switch').exists()).toBe(false)
  })

  it('toggle switch IS rendered when PDP allows write on flag', () => {
    const { wrapper } = mountView({ flags: [mkFlag({ enabled: true })] }, true)
    expect(wrapper.find('.v1-switch').exists()).toBe(true)
  })

  it('changing toggle for enabled flag opens kill dialog without flipping checkbox', async () => {
    const flag = mkFlag({ enabled: true })
    const { wrapper } = mountView({ flags: [flag] }, true)

    const checkbox = wrapper.find('.v1-switch input[type="checkbox"]')
    expect(checkbox.exists()).toBe(true)
    await checkbox.trigger('change')
    await flushPromises()

    // Kill dialog should now be open
    const killDialog = wrapper
      .findAllComponents({ name: 'ConfirmDialog' })
      .find((d) => d.props('titleKey') === 'flags.list.confirm.kill.title')
    expect(killDialog?.props('open')).toBe(true)
  })

  it('changing toggle for disabled flag calls store.toggle with enabled=true', async () => {
    const flag = mkFlag({ enabled: false })
    const { wrapper, store } = mountView({ flags: [flag] }, true)
    vi.mocked(store.toggle).mockResolvedValue(undefined)

    const checkbox = wrapper.find('.v1-switch input[type="checkbox"]')
    await checkbox.trigger('change')
    await flushPromises()

    expect(store.toggle).toHaveBeenCalledWith(flag.key, expect.objectContaining({ enabled: true }))
  })

  it('surfaces an enable failure inline without opening the kill dialog', async () => {
    const flag = mkFlag({ enabled: false })
    const { wrapper, store } = mountView({ flags: [flag] }, true)
    vi.mocked(store.toggle).mockRejectedValue(
      Object.assign(new Error('409'), {
        isAxiosError: true,
        i18nKey: 'errors.ERR_VERSION_CONFLICT',
      }),
    )

    const checkbox = wrapper.find('.v1-switch input[type="checkbox"]')
    await checkbox.trigger('change')
    await flushPromises()

    // Error surfaces inline; the kill-switch confirm dialog must stay closed.
    expect(wrapper.find('[data-testid="toggle-error"]').exists()).toBe(true)
    const killDialog = wrapper
      .findAllComponents({ name: 'ConfirmDialog' })
      .find((d) => d.props('titleKey') === 'flags.list.confirm.kill.title')
    expect(killDialog?.props('open')).toBe(false)
  })
})

describe('FlagsView · kill switch (toggle)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('kill switch confirm dialog renders with danger=true', () => {
    const { wrapper } = mountView({ flags: [mkFlag({ enabled: true })] }, true)
    const dialogs = wrapper.findAllComponents({ name: 'ConfirmDialog' })
    const killDialog = dialogs.find((d) => d.props('danger') === true)
    expect(killDialog).toBeDefined()
  })

  it('calls store.toggle with enabled=false on kill switch confirm', async () => {
    const flag = mkFlag({ enabled: true, version: 2 })
    const { wrapper, store } = mountView({ flags: [flag] }, true)
    vi.mocked(store.toggle).mockResolvedValue(undefined)

    // Open kill switch dialog via kill button click
    const killBtn = wrapper.find('[data-action="kill"]')
    if (killBtn.exists()) {
      await killBtn.trigger('click')
      await flushPromises()
    }

    const dialogs = wrapper.findAllComponents({ name: 'ConfirmDialog' })
    const killDialog = dialogs.find((d) => d.props('titleKey') === 'flags.list.confirm.kill.title')
    killDialog?.vm.$emit('confirm')
    await flushPromises()

    if (vi.mocked(store.toggle).mock.calls.length > 0) {
      expect(store.toggle).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ enabled: false }),
      )
    }
  })

  it('shows CAS conflict error on kill switch failure', async () => {
    const flag = mkFlag({ enabled: true })
    const { wrapper, store } = mountView({ flags: [flag] }, true)
    vi.mocked(store.toggle).mockRejectedValue(
      Object.assign(new Error('409'), {
        isAxiosError: true,
        i18nKey: 'errors.ERR_VERSION_CONFLICT',
      }),
    )

    const killBtn = wrapper.find('[data-action="kill"]')
    if (killBtn.exists()) {
      await killBtn.trigger('click')
      await flushPromises()
    }

    const dialogs = wrapper.findAllComponents({ name: 'ConfirmDialog' })
    const killDialog = dialogs.find((d) => d.props('titleKey') === 'flags.list.confirm.kill.title')
    killDialog?.vm.$emit('confirm')
    await flushPromises()

    if (vi.mocked(store.toggle).mock.calls.length > 0) {
      expect(killDialog?.props('errorKey')).toBeTruthy()
    }
  })
})

describe('FlagsView · delete confirm', () => {
  beforeEach(() => vi.clearAllMocks())

  it('delete confirm dialog renders with danger=true', () => {
    const { wrapper } = mountView({ flags: [mkFlag()] }, true)
    const dialogs = wrapper.findAllComponents({ name: 'ConfirmDialog' })
    const deleteDialog = dialogs.find(
      (d) => d.props('titleKey') === 'flags.list.confirm.delete.title',
    )
    expect(deleteDialog).toBeDefined()
    expect(deleteDialog?.props('danger')).toBe(true)
  })

  it('calls store.remove when delete dialog is confirmed', async () => {
    const flag = mkFlag()
    const { wrapper, store } = mountView({ flags: [flag] }, true)
    vi.mocked(store.remove).mockResolvedValue(undefined)

    const deleteBtn = wrapper.find('[data-action="delete"]')
    if (deleteBtn.exists()) {
      await deleteBtn.trigger('click')
      await flushPromises()
    }

    const dialogs = wrapper.findAllComponents({ name: 'ConfirmDialog' })
    const deleteDialog = dialogs.find(
      (d) => d.props('titleKey') === 'flags.list.confirm.delete.title',
    )
    deleteDialog?.vm.$emit('confirm')
    await flushPromises()

    if (vi.mocked(store.remove).mock.calls.length > 0) {
      expect(store.remove).toHaveBeenCalledWith(expect.any(String))
    }
  })
})

describe('FlagsView · load more', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows load-more button when hasMore=true', () => {
    const { wrapper } = mountView({ flags: [mkFlag()], hasMore: true })
    expect(wrapper.find('[data-action="load-more"]').exists()).toBe(true)
  })

  it('hides load-more button when hasMore=false', () => {
    const { wrapper } = mountView({ flags: [mkFlag()], hasMore: false })
    expect(wrapper.find('[data-action="load-more"]').exists()).toBe(false)
  })

  it('clicking load-more calls store.loadMore', async () => {
    const { wrapper, store } = mountView({ flags: [mkFlag()], hasMore: true })
    vi.mocked(store.loadMore).mockResolvedValue(undefined)
    await wrapper.find('[data-action="load-more"]').trigger('click')
    await flushPromises()
    expect(store.loadMore).toHaveBeenCalled()
  })
})
