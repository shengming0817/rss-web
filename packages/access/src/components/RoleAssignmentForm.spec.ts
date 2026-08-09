import { describe, it, expect, vi } from 'vitest'
import { computed } from 'vue'
import { mount } from '@vue/test-utils'
import { PDP_INJECTION_KEY } from '@gocell/core'
import type { PdpClient } from '@gocell/core'
import type { Role } from '../api/roles'
import RoleAssignmentForm from './RoleAssignmentForm.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const roles: Role[] = [
  { id: 'r-admin', name: 'Admin', permissions: [] },
  { id: 'r-viewer', name: 'Viewer', permissions: [] },
]

function makePdpClient(allowed: boolean): PdpClient {
  return {
    can: () => computed(() => allowed),
    decide: () => Promise.resolve({ effect: allowed ? 'allow' : 'deny', reasonCode: '' }),
  }
}

/**
 * Mount RoleAssignmentForm directly.
 * PDP is provided via global.provide so the <Can> child component can inject it.
 *
 * When noProvider=true, no PDP key is provided — simulates fail-closed.
 */
function mountForm(
  props: {
    roles?: Role[]
    busy?: boolean
    assignRoleId?: string
    assignError?: string | null
    revokeError?: string | null
  } = {},
  pdpAllowed: boolean = true,
  noProvider: boolean = false,
) {
  const resolvedProps = {
    roles,
    busy: false,
    assignRoleId: '',
    assignError: null,
    revokeError: null,
    ...props,
  }

  const globalConfig = noProvider
    ? {}
    : { provide: { [PDP_INJECTION_KEY]: makePdpClient(pdpAllowed) } }

  return mount(RoleAssignmentForm, {
    props: resolvedProps,
    global: globalConfig,
  })
}

describe('RoleAssignmentForm', () => {
  describe('assign section', () => {
    it('emits assign with the trimmed roleId on form submit (V-F7)', async () => {
      const w = mountForm({ assignRoleId: '  role-new  ' })
      await w.find('[data-testid="assign-form"]').trigger('submit')
      const emitted = w.emitted('assign')
      expect(emitted).toBeTruthy()
      expect(emitted![0]).toEqual(['role-new'])
    })

    it('does NOT clear the input after assign emit (parent is responsible)', async () => {
      const w = mountForm({ assignRoleId: 'role-new' })
      await w.find('[data-testid="assign-form"]').trigger('submit')
      // The form should NOT emit update:assignRoleId with '' — clearing is the parent's job
      const updateEmits = w.emitted('update:assignRoleId') ?? []
      // Either no emit at all, or no emit clearing to ''
      const clearingEmits = updateEmits.filter((args) => args[0] === '')
      expect(clearingEmits).toHaveLength(0)
      // The assign emit fired
      expect(w.emitted('assign')).toBeTruthy()
    })

    it('does NOT emit assign when input is blank', async () => {
      const w = mountForm({ assignRoleId: '   ' })
      await w.find('[data-testid="assign-form"]').trigger('submit')
      const emitted = w.emitted('assign')
      expect(emitted).toBeFalsy()
    })

    it('emits assign on form submit (Enter key)', async () => {
      const w = mountForm({ assignRoleId: 'role-enter' })
      await w.find('[data-testid="assign-form"]').trigger('submit')
      const emitted = w.emitted('assign')
      expect(emitted).toBeTruthy()
      expect(emitted![0]).toEqual(['role-enter'])
    })

    it('shows assign.required alert and sets aria-invalid on blank submit (D-F1)', async () => {
      const w = mountForm({ assignRoleId: '' })
      await w.find('[data-testid="assign-form"]').trigger('submit')

      const alert = w.find('[data-testid="assign-required-alert"]')
      expect(alert.exists()).toBe(true)
      expect(alert.attributes('role')).toBe('alert')
      expect(alert.text()).toBe('access.policies.assign.required')

      const input = w.find('[data-testid="assign-input"]')
      expect(input.attributes('aria-invalid')).toBeTruthy()
    })

    it('emits update:assignRoleId when user types in the input', async () => {
      const w = mountForm({ assignRoleId: '' })
      const input = w.find('[data-testid="assign-input"]')
      await input.setValue('typed-value')
      const emitted = w.emitted('update:assignRoleId')
      expect(emitted).toBeTruthy()
    })
  })

  describe('revoke section', () => {
    it('emits revoke with the selected roleId when Revoke button is clicked', async () => {
      const w = mountForm()
      const select = w.find('[data-testid="revoke-select"]')
      await select.setValue('r-viewer')
      const btn = w.find('[data-testid="revoke-btn"]')
      await btn.trigger('click')
      const emitted = w.emitted('revoke')
      expect(emitted).toBeTruthy()
      expect(emitted![0]).toEqual(['r-viewer'])
    })

    it('renders options from the roles prop', () => {
      const w = mountForm()
      const options = w.findAll('[data-testid="revoke-select"] option')
      // Options include a placeholder option (value="") + 2 role options
      const roleOptions = options.filter((o) => o.attributes('value') !== '')
      expect(roleOptions).toHaveLength(2)
    })

    it('disables the revoke select and shows hint when roles is empty', () => {
      const w = mountForm({ roles: [] })
      const select = w.find('[data-testid="revoke-select"]')
      expect(select.attributes('disabled')).toBeDefined()
      const hint = w.find('[data-testid="revoke-empty-hint"]')
      expect(hint.exists()).toBe(true)
      expect(hint.text()).toBe('access.policies.revoke.empty')
    })
  })

  describe('busy state', () => {
    it('disables the assign input when busy', () => {
      const w = mountForm({ busy: true })
      const input = w.find('[data-testid="assign-input"]')
      expect(input.attributes('disabled')).toBeDefined()
    })

    it('disables the assign button when busy', () => {
      const w = mountForm({ busy: true })
      const btn = w.find('[data-testid="assign-btn"]')
      expect(btn.attributes('disabled')).toBeDefined()
    })

    it('assign button has aria-busy reflecting busy prop (A-F2)', () => {
      const w = mountForm({ busy: true })
      const btn = w.find('[data-testid="assign-btn"]')
      expect(btn.attributes('aria-busy')).toBe('true')
    })

    it('revoke button has aria-busy reflecting busy prop (A-F2)', () => {
      const w = mountForm({ busy: true })
      const btn = w.find('[data-testid="revoke-btn"]')
      expect(btn.attributes('aria-busy')).toBe('true')
    })

    it('aria-busy is false when not busy', () => {
      const w = mountForm({ busy: false })
      const assignBtn = w.find('[data-testid="assign-btn"]')
      expect(assignBtn.attributes('aria-busy')).toBe('false')
      const revokeBtn = w.find('[data-testid="revoke-btn"]')
      expect(revokeBtn.attributes('aria-busy')).toBe('false')
    })

    it('disables the revoke select when busy', () => {
      const w = mountForm({ busy: true })
      const select = w.find('[data-testid="revoke-select"]')
      expect(select.attributes('disabled')).toBeDefined()
    })

    it('disables the revoke button when busy', () => {
      const w = mountForm({ busy: true })
      const btn = w.find('[data-testid="revoke-btn"]')
      expect(btn.attributes('disabled')).toBeDefined()
    })
  })

  describe('assignError / revokeError props (split error scoping)', () => {
    it('renders assign error alert when assignError is provided', () => {
      const w = mountForm({ assignError: 'access.policies.errors.assignFailed' })
      const alert = w.find('[data-testid="assign-error-alert"]')
      expect(alert.exists()).toBe(true)
      expect(alert.attributes('role')).toBe('alert')
      expect(alert.text()).toBe('access.policies.errors.assignFailed')
    })

    it('sets aria-invalid on assign input when assignError is set', () => {
      const w = mountForm({ assignError: 'access.policies.errors.assignFailed' })
      const input = w.find('[data-testid="assign-input"]')
      expect(input.attributes('aria-invalid')).toBeTruthy()
    })

    it('does NOT set aria-invalid on revoke select when only assignError is set', () => {
      const w = mountForm({ assignError: 'access.policies.errors.assignFailed' })
      const select = w.find('[data-testid="revoke-select"]')
      expect(select.attributes('aria-invalid')).toBeUndefined()
    })

    it('does NOT render revoke error alert when only assignError is set', () => {
      const w = mountForm({ assignError: 'access.policies.errors.assignFailed' })
      expect(w.find('[data-testid="revoke-error-alert"]').exists()).toBe(false)
    })

    it('renders revoke error alert when revokeError is provided', () => {
      const w = mountForm({ revokeError: 'access.policies.errors.revokeFailed' })
      const alert = w.find('[data-testid="revoke-error-alert"]')
      expect(alert.exists()).toBe(true)
      expect(alert.attributes('role')).toBe('alert')
      expect(alert.text()).toBe('access.policies.errors.revokeFailed')
    })

    it('sets aria-invalid on revoke select when revokeError is set', () => {
      const w = mountForm({ revokeError: 'access.policies.errors.revokeFailed' })
      const select = w.find('[data-testid="revoke-select"]')
      expect(select.attributes('aria-invalid')).toBeTruthy()
    })

    it('does NOT set aria-invalid on assign input when only revokeError is set', () => {
      const w = mountForm({ revokeError: 'access.policies.errors.revokeFailed' })
      const input = w.find('[data-testid="assign-input"]')
      expect(input.attributes('aria-invalid')).toBeUndefined()
    })

    it('does NOT render assign error alert when only revokeError is set', () => {
      const w = mountForm({ revokeError: 'access.policies.errors.revokeFailed' })
      expect(w.find('[data-testid="assign-error-alert"]').exists()).toBe(false)
    })

    it('does not render error alerts when both are null', () => {
      const w = mountForm({ assignError: null, revokeError: null })
      expect(w.find('[data-testid="assign-error-alert"]').exists()).toBe(false)
      expect(w.find('[data-testid="revoke-error-alert"]').exists()).toBe(false)
    })
  })

  describe('fail-closed: PDP denies or no provider', () => {
    it('does NOT render assign button when PDP denies', () => {
      const w = mountForm({}, false)
      const btn = w.find('[data-testid="assign-btn"]')
      expect(btn.exists()).toBe(false)
    })

    it('does NOT render revoke button when PDP denies', () => {
      const w = mountForm({}, false)
      const btn = w.find('[data-testid="revoke-btn"]')
      expect(btn.exists()).toBe(false)
    })

    it('does NOT render assign button when no provider', () => {
      const w = mountForm({}, true, true)
      const btn = w.find('[data-testid="assign-btn"]')
      expect(btn.exists()).toBe(false)
    })

    it('does NOT render revoke button when no provider', () => {
      const w = mountForm({}, true, true)
      const btn = w.find('[data-testid="revoke-btn"]')
      expect(btn.exists()).toBe(false)
    })
  })

  describe('a11y', () => {
    it('associates the assign label with the assign input via for/id', () => {
      const w = mountForm()
      const input = w.find('[data-testid="assign-input"]')
      const inputId = input.attributes('id')
      expect(inputId).toBeTruthy()
      const label = w.find(`label[for="${inputId}"]`)
      expect(label.exists()).toBe(true)
    })

    it('associates the revoke label with the revoke select via for/id', () => {
      const w = mountForm()
      const select = w.find('[data-testid="revoke-select"]')
      const selectId = select.attributes('id')
      expect(selectId).toBeTruthy()
      const label = w.find(`label[for="${selectId}"]`)
      expect(label.exists()).toBe(true)
    })
  })
})
