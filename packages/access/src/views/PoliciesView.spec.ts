import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import { createTestingPinia } from '@pinia/testing'
import { PDP_INJECTION_KEY, type PdpClient } from '@gocell/core'
import type { GoCellRequestError } from '@gocell/request'
import { usePoliciesStore, TenantUnavailableError } from '../stores/usePoliciesStore'
import type { Role } from '../api/roles'
import PoliciesView from './PoliciesView.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const pdp = (allowed: boolean): PdpClient => ({
  can: () => computed(() => allowed),
  decide: () => Promise.resolve({ effect: allowed ? 'allow' : 'deny', reasonCode: '' }),
})

const mkRole = (over: Partial<Role> = {}): Role => ({
  id: 'role-1',
  name: 'admin',
  permissions: [{ resource: 'identity', action: 'read' }],
  ...over,
})

type State = {
  userId?: string
  roles?: Role[]
  loading?: boolean
  errorKey?: string | null
  mutating?: boolean
}

function mountView(state: State = {}, pdpAllowed = true) {
  const wrapper = mount(PoliciesView, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            'access.policies': {
              userId: '',
              roles: [],
              loading: false,
              errorKey: null,
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
  const store = usePoliciesStore()
  return { wrapper, store }
}

describe('PoliciesView · tabs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders 3 tabs', () => {
    const { wrapper } = mountView()
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(3)
  })

  it('roles tab is active (aria-selected=true, tabindex=0)', () => {
    const { wrapper } = mountView()
    const rolesTab = wrapper.get('#policies-tab-roles')
    expect(rolesTab.attributes('aria-selected')).toBe('true')
    expect(rolesTab.attributes('tabindex')).toBe('0')
  })

  it('rules and templates tabs are aria-disabled and not focusable', () => {
    const { wrapper } = mountView()
    const disabledTabs = wrapper
      .findAll('[role="tab"]')
      .filter((t) => t.attributes('aria-disabled') === 'true')
    expect(disabledTabs).toHaveLength(2)
    disabledTabs.forEach((tab) => {
      expect(tab.attributes('tabindex')).toBe('-1')
      // must NOT use the HTML disabled attribute (drops from a11y tree)
      expect(tab.attributes('disabled')).toBeUndefined()
    })
  })

  it('disabled tabs carry a title hint', () => {
    const { wrapper } = mountView()
    const rulesTab = wrapper.get('#policies-tab-rules')
    const templatesTab = wrapper.get('#policies-tab-templates')
    expect(rulesTab.attributes('title')).toBe('access.policies.tabs.rulesHint')
    expect(templatesTab.attributes('title')).toBe('access.policies.tabs.templatesHint')
  })

  it('roles tabpanel is labelled by the roles tab', () => {
    const { wrapper } = mountView()
    const tab = wrapper.get('#policies-tab-roles')
    expect(tab.attributes('aria-controls')).toBe('policies-panel-roles')
    const panel = wrapper.get('#policies-panel-roles')
    expect(panel.attributes('role')).toBe('tabpanel')
    expect(panel.attributes('aria-labelledby')).toBe('policies-tab-roles')
  })

  it('disabled placeholder tabpanels are hidden', () => {
    const { wrapper } = mountView()
    const rulesPanel = wrapper.get('#policies-panel-rules')
    expect(rulesPanel.attributes('role')).toBe('tabpanel')
    expect(rulesPanel.attributes('hidden')).toBeDefined()

    const templatesPanel = wrapper.get('#policies-panel-templates')
    expect(templatesPanel.attributes('role')).toBe('tabpanel')
    expect(templatesPanel.attributes('hidden')).toBeDefined()
  })
})

describe('PoliciesView · lookup form', () => {
  beforeEach(() => vi.clearAllMocks())

  it('has a labelled userId input', () => {
    const { wrapper } = mountView()
    expect(wrapper.find('label[for="policies-user-input"]').exists()).toBe(true)
    expect(wrapper.find('#policies-user-input').exists()).toBe(true)
  })

  it('submitting with a userId calls store.fetchRoles with that id', async () => {
    const { wrapper, store } = mountView()
    const input = wrapper.get('#policies-user-input')
    await input.setValue('u-1')
    // The lookup button is type="submit" — trigger form submit (V-F1: no @click.prevent on button)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(store.fetchRoles).toHaveBeenCalledWith('u-1')
  })

  it('blank submit shows user.required alert and does NOT call fetchRoles (D-F1)', async () => {
    const { wrapper, store } = mountView()
    await wrapper.get('#policies-user-input').setValue('')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const alert = wrapper.find('[data-testid="user-required-alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toBe('access.policies.user.required')
    expect(store.fetchRoles).not.toHaveBeenCalled()
  })
})

describe('PoliciesView · states', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows prompt hint before any lookup (no userId, no roles, not loading)', () => {
    const { wrapper } = mountView({ userId: '', roles: [], loading: false, errorKey: null })
    expect(wrapper.text()).toContain('access.policies.prompt')
  })

  it('prompt has role=status (A-F1)', () => {
    const { wrapper } = mountView({ userId: '', roles: [], loading: false, errorKey: null })
    const prompt = wrapper.find('.policies__prompt')
    expect(prompt.exists()).toBe(true)
    expect(prompt.attributes('role')).toBe('status')
  })

  it('shows loading indicator (role=status) while loading', () => {
    const { wrapper } = mountView({ loading: true, roles: [] })
    const status = wrapper.find('[role="status"]')
    expect(status.exists()).toBe(true)
    expect(status.text()).toContain('access.policies.loading')
  })

  it('shows empty state after a lookup that yielded no roles', () => {
    const { wrapper } = mountView({ userId: 'u-1', roles: [], loading: false, errorKey: null })
    expect(wrapper.text()).toContain('access.policies.empty')
  })

  it('shows fetch error in role=alert when errorKey is set', () => {
    const { wrapper } = mountView({ errorKey: 'errors.network' })
    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('errors.network')
  })

  it('renders RolePermissionMatrix and RoleAssignmentForm when roles.length > 0', () => {
    const { wrapper } = mountView({ userId: 'u-1', roles: [mkRole()], loading: false })
    // Both child components should be present
    expect(wrapper.findComponent({ name: 'RolePermissionMatrix' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'RoleAssignmentForm' }).exists()).toBe(true)
  })

  it('does NOT render RolePermissionMatrix when roles is empty', () => {
    const { wrapper } = mountView({ userId: 'u-1', roles: [], loading: false })
    expect(wrapper.findComponent({ name: 'RolePermissionMatrix' }).exists()).toBe(false)
  })

  it('renders SR-only roleCount region when roles exist (A-F5)', () => {
    const { wrapper } = mountView({ userId: 'u-1', roles: [mkRole()], loading: false })
    const srRegion = wrapper.find('.sr-only[role="status"]')
    expect(srRegion.exists()).toBe(true)
    expect(srRegion.text()).toContain('access.policies.roleCount')
  })
})

describe('PoliciesView · mutations', () => {
  beforeEach(() => vi.clearAllMocks())

  function mountWithRoles() {
    return mountView({ userId: 'u-1', roles: [mkRole()], loading: false })
  }

  it('@assign from RoleAssignmentForm calls store.assign with the roleId', async () => {
    const { wrapper, store } = mountWithRoles()
    vi.mocked(store.assign).mockResolvedValue(undefined)
    wrapper.findComponent({ name: 'RoleAssignmentForm' }).vm.$emit('assign', 'role-1')
    await flushPromises()
    expect(store.assign).toHaveBeenCalledWith('role-1')
  })

  it('@revoke from RoleAssignmentForm calls store.revoke with the roleId', async () => {
    const { wrapper, store } = mountWithRoles()
    vi.mocked(store.revoke).mockResolvedValue(undefined)
    wrapper.findComponent({ name: 'RoleAssignmentForm' }).vm.$emit('revoke', 'role-1')
    await flushPromises()
    expect(store.revoke).toHaveBeenCalledWith('role-1')
  })

  it('successful assign clears assignRoleId (input becomes empty)', async () => {
    const { wrapper, store } = mountWithRoles()
    vi.mocked(store.assign).mockResolvedValue(undefined)
    const form = wrapper.findComponent({ name: 'RoleAssignmentForm' })
    // Simulate parent having typed a role id
    await wrapper.setData({})
    // Emit assign from child
    form.vm.$emit('assign', 'role-1')
    await flushPromises()
    // After success the parent clears the v-model
    expect(form.props('assignRoleId')).toBe('')
  })

  it('passes assign error as assign-error to RoleAssignmentForm when store.assign rejects', async () => {
    const { wrapper, store } = mountWithRoles()
    vi.mocked(store.assign).mockRejectedValue(new Error('assign failed'))
    wrapper.findComponent({ name: 'RoleAssignmentForm' }).vm.$emit('assign', 'role-1')
    await flushPromises()

    const form = wrapper.findComponent({ name: 'RoleAssignmentForm' })
    expect(form.props('assignError')).toBe('access.policies.errors.assignFailed')
  })

  it('maps TenantUnavailableError to the tenantUnavailable assign-error key', async () => {
    const { wrapper, store } = mountWithRoles()
    vi.mocked(store.assign).mockRejectedValue(new TenantUnavailableError())
    wrapper.findComponent({ name: 'RoleAssignmentForm' }).vm.$emit('assign', 'role-1')
    await flushPromises()

    const form = wrapper.findComponent({ name: 'RoleAssignmentForm' })
    expect(form.props('assignError')).toBe('access.policies.errors.tenantUnavailable')
  })

  it('maps TenantUnavailableError to the tenantUnavailable revoke-error key', async () => {
    const { wrapper, store } = mountWithRoles()
    vi.mocked(store.revoke).mockRejectedValue(new TenantUnavailableError())
    wrapper.findComponent({ name: 'RoleAssignmentForm' }).vm.$emit('revoke', 'role-1')
    await flushPromises()

    const form = wrapper.findComponent({ name: 'RoleAssignmentForm' })
    expect(form.props('revokeError')).toBe('access.policies.errors.tenantUnavailable')
  })

  it('assign failure does NOT set revokeError', async () => {
    const { wrapper, store } = mountWithRoles()
    vi.mocked(store.assign).mockRejectedValue(new Error('assign failed'))
    wrapper.findComponent({ name: 'RoleAssignmentForm' }).vm.$emit('assign', 'role-1')
    await flushPromises()

    const form = wrapper.findComponent({ name: 'RoleAssignmentForm' })
    expect(form.props('revokeError')).toBeNull()
  })

  it('revoke failure does NOT set assignError', async () => {
    const { wrapper, store } = mountWithRoles()
    vi.mocked(store.revoke).mockRejectedValue(new Error('revoke failed'))
    wrapper.findComponent({ name: 'RoleAssignmentForm' }).vm.$emit('revoke', 'role-1')
    await flushPromises()

    const form = wrapper.findComponent({ name: 'RoleAssignmentForm' })
    expect(form.props('assignError')).toBeNull()
  })

  it('surfaces assign error in role=alert when store.assign rejects', async () => {
    const { wrapper, store } = mountWithRoles()
    vi.mocked(store.assign).mockRejectedValue(new Error('assign failed'))
    wrapper.findComponent({ name: 'RoleAssignmentForm' }).vm.$emit('assign', 'role-1')
    await flushPromises()
    const alerts = wrapper.findAll('[role="alert"]')
    // The mutation error alert must appear (inside RoleAssignmentForm)
    expect(alerts.some((a) => a.text().includes('access.policies.errors.assignFailed'))).toBe(true)
  })

  it('surfaces revoke error in role=alert when store.revoke rejects', async () => {
    const { wrapper, store } = mountWithRoles()
    vi.mocked(store.revoke).mockRejectedValue(new Error('revoke failed'))
    wrapper.findComponent({ name: 'RoleAssignmentForm' }).vm.$emit('revoke', 'role-1')
    await flushPromises()
    const alerts = wrapper.findAll('[role="alert"]')
    expect(alerts.some((a) => a.text().includes('access.policies.errors.revokeFailed'))).toBe(true)
  })

  it('surfaces isGoCellRequestError i18nKey when available (T-F5)', async () => {
    const { wrapper, store } = mountWithRoles()
    const goCellErr = Object.assign(new Error('typed'), {
      isAxiosError: true,
      i18nKey: 'access.policies.errors.custom',
    }) as unknown as GoCellRequestError
    vi.mocked(store.assign).mockRejectedValue(goCellErr)
    wrapper.findComponent({ name: 'RoleAssignmentForm' }).vm.$emit('assign', 'role-1')
    await flushPromises()
    const alerts = wrapper.findAll('[role="alert"]')
    expect(alerts.some((a) => a.text().includes('access.policies.errors.custom'))).toBe(true)
  })

  it('RoleAssignmentForm busy prop reflects store mutating (P-F2)', () => {
    const { wrapper } = mountView({
      userId: 'u-1',
      roles: [mkRole()],
      loading: false,
      mutating: true,
    })
    const form = wrapper.findComponent({ name: 'RoleAssignmentForm' })
    expect(form.props('busy')).toBe(true)
  })
})
