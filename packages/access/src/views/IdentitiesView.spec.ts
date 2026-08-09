import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, computed } from 'vue'
import { createTestingPinia } from '@pinia/testing'
import { PDP_INJECTION_KEY, type PdpClient } from '@gocell/core'
import { useIdentitiesStore } from '../stores/useIdentitiesStore'
import type { Identity } from '../api/identities'
import IdentitiesView from './IdentitiesView.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const pdp = (allowed: boolean): PdpClient => ({
  can: () => computed(() => allowed),
  decide: () => Promise.resolve({ effect: allowed ? 'allow' : 'deny', reasonCode: '' }),
})

const mkUser = (over: Partial<Identity> = {}): Identity => ({
  id: 'u-1',
  username: 'alice',
  email: 'alice@corp.example',
  status: 'active',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-02T00:00:00Z',
  ...over,
})

type State = {
  users?: ReturnType<typeof mkUser>[]
  loading?: boolean
  errorKey?: string | null
  hasMore?: boolean
}

function mountView(state: State = {}) {
  const wrapper = mount(IdentitiesView, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            'access.identities': {
              users: [],
              loading: false,
              errorKey: null,
              nextCursor: '',
              hasMore: false,
              filter: '',
              ...state,
            },
          },
        }),
      ],
    },
  })
  const store = useIdentitiesStore()
  return { wrapper, store }
}

const rows = (w: ReturnType<typeof mountView>['wrapper']) => w.findAll('tbody tr')

describe('IdentitiesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches the list once on mount', () => {
    const { store } = mountView()
    expect(store.fetchList).toHaveBeenCalledTimes(1)
  })

  it('renders one table row per identity', () => {
    const { wrapper } = mountView({ users: [mkUser(), mkUser({ id: 'u-2', username: 'bob' })] })
    expect(rows(wrapper)).toHaveLength(2)
  })

  it('renders column headers with scope="col"', () => {
    const { wrapper } = mountView({ users: [mkUser()] })
    const headers = wrapper.findAll('thead th')
    expect(headers.length).toBeGreaterThanOrEqual(4)
    headers.forEach((h) => expect(h.attributes('scope')).toBe('col'))
  })

  it('exposes the createdAt cell as a semantic <time> with a machine-readable datetime', () => {
    const { wrapper } = mountView({ users: [mkUser({ createdAt: '2026-05-01T00:00:00Z' })] })
    expect(wrapper.find('tbody tr time').attributes('datetime')).toBe('2026-05-01T00:00:00Z')
  })

  it('associates the quick-filter input with a label and narrows visible rows', async () => {
    const { wrapper, store } = mountView({
      users: [mkUser({ id: 'u-1', username: 'alice' }), mkUser({ id: 'u-2', username: 'bob' })],
    })
    const input = wrapper.find('#identities-filter')
    expect(wrapper.find('label[for="identities-filter"]').exists()).toBe(true)
    expect(rows(wrapper)).toHaveLength(2)

    store.filter = 'bob'
    await nextTick()
    expect(rows(wrapper)).toHaveLength(1)
    expect(input.exists()).toBe(true)
  })

  it('shows a loading indicator (role=status) while loading with no rows yet', () => {
    const { wrapper } = mountView({ loading: true, users: [] })
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
  })

  it('shows an empty message when there are no users and not loading', () => {
    const { wrapper } = mountView({ users: [], loading: false })
    expect(wrapper.find('.identities__empty').exists()).toBe(true)
  })

  it('surfaces the store error via role=alert with the i18n key', () => {
    const { wrapper } = mountView({ errorKey: 'errors.network' })
    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('errors.network')
  })

  it('renders the data table with an accessible name', () => {
    const { wrapper } = mountView({ users: [mkUser()] })
    expect(wrapper.find('table').attributes('aria-label')).toBeTruthy()
  })

  it('renders a disabled "service accounts" tab that is not focusable', () => {
    const { wrapper } = mountView()
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(2)
    const disabled = tabs.find((t) => t.attributes('aria-disabled') === 'true')
    expect(disabled).toBeDefined()
    expect(disabled!.attributes('tabindex')).toBe('-1')
    // it must NOT use the HTML disabled attribute (which drops it from the a11y tree)
    expect(disabled!.attributes('disabled')).toBeUndefined()
  })

  it('marks the active users tab selected', () => {
    const { wrapper } = mountView()
    const selected = wrapper
      .findAll('[role="tab"]')
      .find((t) => t.attributes('aria-selected') === 'true')
    expect(selected).toBeDefined()
    expect(selected!.attributes('tabindex')).toBe('0')
  })

  it('wires the active tab to a labelled tabpanel', () => {
    const { wrapper } = mountView({ users: [mkUser()] })
    const tab = wrapper.get('#identities-tab-users')
    expect(tab.attributes('aria-controls')).toBe('identities-panel-users')
    const panel = wrapper.get('#identities-panel-users')
    expect(panel.attributes('role')).toBe('tabpanel')
    expect(panel.attributes('aria-labelledby')).toBe('identities-tab-users')
  })

  it('wires the disabled service-accounts tab to a hidden placeholder tabpanel', () => {
    const { wrapper } = mountView()
    const tab = wrapper.get('#identities-tab-service-accounts')
    expect(tab.attributes('aria-controls')).toBe('identities-panel-service-accounts')
    const panel = wrapper.get('#identities-panel-service-accounts')
    expect(panel.attributes('role')).toBe('tabpanel')
    expect(panel.attributes('aria-labelledby')).toBe('identities-tab-service-accounts')
    expect(panel.attributes('hidden')).toBeDefined()
  })

  it('announces the (filtered) result count via an sr-only live region', async () => {
    const { wrapper } = mountView({
      users: [mkUser({ id: 'u-1', username: 'alice' }), mkUser({ id: 'u-2', username: 'bob' })],
    })
    const live = wrapper.find('.sr-only[role="status"]')
    expect(live.exists()).toBe(true)
    expect(live.text()).toContain('access.identities.resultCount')
  })

  it('shows a load-more control only when more pages exist and calls loadMore', async () => {
    const { wrapper, store } = mountView({ users: [mkUser()], hasMore: true })
    const btn = wrapper.find('[data-action="load-more"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()
    expect(store.loadMore).toHaveBeenCalledTimes(1)
  })

  it('hides the load-more control when there are no more pages', () => {
    const { wrapper } = mountView({ users: [mkUser()], hasMore: false })
    expect(wrapper.find('[data-action="load-more"]').exists()).toBe(false)
  })
})

describe('IdentitiesView · operations (Can + modals)', () => {
  function mountWithPdp(allowed: boolean | undefined, users = [mkUser()]) {
    const provide: Record<symbol, PdpClient> = {}
    if (allowed !== undefined) provide[PDP_INJECTION_KEY] = pdp(allowed)
    const wrapper = mount(IdentitiesView, {
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            initialState: {
              'access.identities': {
                users,
                loading: false,
                errorKey: null,
                nextCursor: '',
                hasMore: false,
                filter: '',
              },
            },
          }),
        ],
        provide,
      },
    })
    return { wrapper, store: useIdentitiesStore() }
  }

  const actionBtn = (w: ReturnType<typeof mountWithPdp>['wrapper'], key: string) =>
    w.findAll('.identities__action').find((b) => b.text() === key)

  it('shows the create button only when the PDP allows it', () => {
    expect(mountWithPdp(true).wrapper.find('[data-action="create"]').exists()).toBe(true)
    expect(mountWithPdp(false).wrapper.find('[data-action="create"]').exists()).toBe(false)
  })

  it('hides the create button fail-closed when no PDP provider is mounted', () => {
    expect(mountWithPdp(undefined).wrapper.find('[data-action="create"]').exists()).toBe(false)
  })

  it('renders row action buttons when the PDP allows', () => {
    const { wrapper } = mountWithPdp(true)
    expect(actionBtn(wrapper, 'access.identities.actions.edit')).toBeDefined()
    expect(actionBtn(wrapper, 'access.identities.actions.delete')).toBeDefined()
  })

  it('gives each row action button an aria-label (username-scoped for screen readers)', () => {
    const { wrapper } = mountWithPdp(true)
    const edit = actionBtn(wrapper, 'access.identities.actions.edit')!
    expect(edit.attributes('aria-label')).toContain('access.identities.actions.edit')
  })

  it('hides all row action buttons fail-closed when the PDP denies', () => {
    const { wrapper } = mountWithPdp(false)
    expect(wrapper.findAll('.identities__action')).toHaveLength(0)
  })

  it('opens the create modal when the create button is clicked', async () => {
    const { wrapper } = mountWithPdp(true)
    await wrapper.find('[data-action="create"]').trigger('click')
    await nextTick()
    expect(wrapper.find('#identity-form-title').text()).toBe('access.identities.form.createTitle')
  })

  it('opens the edit modal in edit mode when a row edit button is clicked', async () => {
    const { wrapper } = mountWithPdp(true)
    await actionBtn(wrapper, 'access.identities.actions.edit')!.trigger('click')
    await nextTick()
    expect(wrapper.find('#identity-form-title').text()).toBe('access.identities.form.editTitle')
  })

  it('opens the change-password modal when its action is clicked', async () => {
    const { wrapper } = mountWithPdp(true)
    await actionBtn(wrapper, 'access.identities.actions.changePassword')!.trigger('click')
    await nextTick()
    expect(wrapper.find('#change-password-title').exists()).toBe(true)
  })

  it('shows a Lock action for an active user and Unlock for a locked one', () => {
    const active = mountWithPdp(true, [mkUser({ status: 'active' })]).wrapper
    expect(actionBtn(active, 'access.identities.actions.lock')).toBeDefined()
    expect(actionBtn(active, 'access.identities.actions.unlock')).toBeUndefined()

    const locked = mountWithPdp(true, [mkUser({ status: 'locked' })]).wrapper
    expect(actionBtn(locked, 'access.identities.actions.unlock')).toBeDefined()
    expect(actionBtn(locked, 'access.identities.actions.lock')).toBeUndefined()
  })

  it('opens an alertdialog confirm when a destructive action is clicked', async () => {
    const { wrapper } = mountWithPdp(true)
    await actionBtn(wrapper, 'access.identities.actions.delete')!.trigger('click')
    await nextTick()
    const panel = wrapper.find('.modal__panel')
    expect(panel.attributes('role')).toBe('alertdialog')
    expect(wrapper.find('#confirm-dialog-title').text()).toBe(
      'access.identities.confirm.delete.title',
    )
  })

  it('runs store.remove and closes the dialog on delete confirm', async () => {
    const { wrapper, store } = mountWithPdp(true)
    vi.mocked(store.remove).mockResolvedValue(undefined)
    await actionBtn(wrapper, 'access.identities.actions.delete')!.trigger('click')
    await nextTick()
    const buttons = wrapper.findAll('.confirm__btn')
    await buttons[buttons.length - 1]!.trigger('click')
    await flushPromises()
    expect(store.remove).toHaveBeenCalledWith('u-1')
    expect(wrapper.find('.modal__panel').exists()).toBe(false)
  })
})
