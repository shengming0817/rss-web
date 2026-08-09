import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePoliciesStore, TenantUnavailableError } from './usePoliciesStore'
import { useAuthStore } from './useAuthStore'
import type { Role } from '../api/roles'

// Mirror the pattern from useIdentitiesStore.spec.ts — mock the api module, not @gocell/request
vi.mock('../api/roles', () => ({
  listUserRoles: vi.fn(),
  assignRole: vi.fn(),
  revokeRole: vi.fn(),
  ROLES_URL: '/api/v1/access/roles',
}))

// Import mocked functions after vi.mock hoisting
import { listUserRoles, assignRole, revokeRole } from '../api/roles'

const mkRole = (over: Partial<Role> = {}): Role => ({
  id: 'role-1',
  name: 'admin',
  permissions: [{ resource: 'users', action: 'read' }],
  ...over,
})

describe('usePoliciesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    // Default: a tenant is in session so mutations reach the API. The
    // tenant-missing guard is exercised explicitly below by setting it null.
    useAuthStore().tenantId = 'tenant-1'
  })

  it('starts with empty state', () => {
    const store = usePoliciesStore()
    expect(store.userId).toBe('')
    expect(store.roles).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.errorKey).toBeNull()
    expect(store.mutating).toBe(false)
  })

  describe('fetchRoles', () => {
    it('populates roles on success and clears error', async () => {
      const roles = [mkRole(), mkRole({ id: 'role-2', name: 'viewer' })]
      vi.mocked(listUserRoles).mockResolvedValueOnce(roles)

      const store = usePoliciesStore()
      await store.fetchRoles('u-1')

      expect(store.userId).toBe('u-1')
      expect(store.roles).toEqual(roles)
      expect(store.loading).toBe(false)
      expect(store.errorKey).toBeNull()
    })

    it('sets loading=true during the request, then false after', async () => {
      let resolveRoles!: (v: Role[]) => void
      vi.mocked(listUserRoles).mockReturnValueOnce(
        new Promise<Role[]>((res) => {
          resolveRoles = res
        }),
      )

      const store = usePoliciesStore()
      const p = store.fetchRoles('u-1')
      expect(store.loading).toBe(true)
      resolveRoles([mkRole()])
      await p
      expect(store.loading).toBe(false)
    })

    it('swallows errors into errorKey and leaves prior roles intact', async () => {
      const store = usePoliciesStore()
      // Seed prior roles
      store.roles = [mkRole()]

      // Must look like an AxiosError (isAxiosError: true) for toI18nKey to extract the code.
      vi.mocked(listUserRoles).mockRejectedValueOnce(
        Object.assign(new Error('Request failed with status code 403'), {
          isAxiosError: true,
          response: { data: { error: { code: 'ERR_AUTH_FORBIDDEN' } }, status: 403 },
        }),
      )
      await store.fetchRoles('u-1')

      expect(store.errorKey).toBe('errors.ERR_AUTH_FORBIDDEN')
      expect(store.loading).toBe(false)
      // Prior roles remain untouched
      expect(store.roles).toHaveLength(1)
    })

    it('sets errorKey to errors.unknown for a plain Error (T-F4)', async () => {
      const store = usePoliciesStore()
      vi.mocked(listUserRoles).mockRejectedValueOnce(new Error('plain fail'))
      await store.fetchRoles('u-1')
      expect(store.errorKey).toBe('errors.unknown')
    })

    it('short-circuits on blank userId — no API call, roles cleared', async () => {
      const store = usePoliciesStore()
      store.roles = [mkRole()]

      await store.fetchRoles('')

      expect(listUserRoles).not.toHaveBeenCalled()
      expect(store.roles).toEqual([])
    })

    it('short-circuits on whitespace-only userId', async () => {
      await usePoliciesStore().fetchRoles('   ')
      expect(listUserRoles).not.toHaveBeenCalled()
    })

    it('clears a prior errorKey on a subsequent successful fetch', async () => {
      vi.mocked(listUserRoles).mockRejectedValueOnce(new Error('fail'))
      const store = usePoliciesStore()
      await store.fetchRoles('u-1')
      expect(store.errorKey).not.toBeNull()

      vi.mocked(listUserRoles).mockResolvedValueOnce([mkRole()])
      await store.fetchRoles('u-1')
      expect(store.errorKey).toBeNull()
    })

    it('ignores stale in-flight response (race guard P-F6)', async () => {
      // First call is slow; second call resolves first with newer data.
      let resolveFirst!: (v: Role[]) => void
      vi.mocked(listUserRoles)
        .mockReturnValueOnce(
          new Promise<Role[]>((res) => {
            resolveFirst = res
          }),
        )
        .mockResolvedValueOnce([mkRole({ id: 'role-newer', name: 'newer' })])

      const store = usePoliciesStore()
      // Start first (slow) fetch
      const p1 = store.fetchRoles('u-1')
      // Start second (fast) fetch immediately — it resolves first
      await store.fetchRoles('u-2')

      // Now resolve the first (stale) fetch
      resolveFirst([mkRole({ id: 'role-stale', name: 'stale' })])
      await p1

      // The stale result must not overwrite the newer one
      expect(store.roles.every((r) => r.id !== 'role-stale')).toBe(true)
      expect(store.roles.some((r) => r.id === 'role-newer')).toBe(true)
    })
  })

  describe('assign', () => {
    it('calls assignRole with userId + roleId then refetches', async () => {
      vi.mocked(assignRole).mockResolvedValueOnce(undefined)
      vi.mocked(listUserRoles).mockResolvedValueOnce([mkRole()])

      const store = usePoliciesStore()
      store.userId = 'u-1'
      await store.assign('role-1')

      expect(assignRole).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        userId: 'u-1',
        roleId: 'role-1',
      })
      expect(listUserRoles).toHaveBeenCalledWith('u-1')
      expect(store.roles).toHaveLength(1)
    })

    it('throws TenantUnavailableError and does NOT call the API when no tenant in session', async () => {
      useAuthStore().tenantId = null
      const store = usePoliciesStore()
      store.userId = 'u-1'

      await expect(store.assign('role-1')).rejects.toBeInstanceOf(TenantUnavailableError)
      expect(assignRole).not.toHaveBeenCalled()
      expect(store.mutating).toBe(false)
    })

    it('re-throws on failure and does NOT set errorKey', async () => {
      vi.mocked(assignRole).mockRejectedValueOnce(new Error('assign failed'))

      const store = usePoliciesStore()
      store.userId = 'u-1'
      await expect(store.assign('role-1')).rejects.toThrow('assign failed')
      expect(store.errorKey).toBeNull()
    })

    it('does not refetch when assign fails', async () => {
      vi.mocked(assignRole).mockRejectedValueOnce(new Error('fail'))

      const store = usePoliciesStore()
      store.userId = 'u-1'
      await expect(store.assign('role-1')).rejects.toThrow()
      expect(listUserRoles).not.toHaveBeenCalled()
    })

    it('resets mutating to false after failure (re-throw path)', async () => {
      vi.mocked(assignRole).mockRejectedValueOnce(new Error('fail'))
      const store = usePoliciesStore()
      store.userId = 'u-1'
      await expect(store.assign('role-1')).rejects.toThrow()
      expect(store.mutating).toBe(false)
    })

    it('mutating is true during assign and false after success', async () => {
      let resolveAssign!: () => void
      vi.mocked(assignRole).mockReturnValueOnce(
        new Promise<void>((res) => {
          resolveAssign = res
        }),
      )
      vi.mocked(listUserRoles).mockResolvedValueOnce([mkRole()])

      const store = usePoliciesStore()
      store.userId = 'u-1'
      const p = store.assign('role-1')
      expect(store.mutating).toBe(true)
      resolveAssign()
      await p
      expect(store.mutating).toBe(false)
    })

    it('concurrent assign is a no-op while first is in-flight (P-F2)', async () => {
      let resolveFirst!: () => void
      vi.mocked(assignRole).mockReturnValueOnce(
        new Promise<void>((res) => {
          resolveFirst = res
        }),
      )
      vi.mocked(listUserRoles).mockResolvedValue([mkRole()])

      const store = usePoliciesStore()
      store.userId = 'u-1'

      // Start first assign but don't await
      const p1 = store.assign('role-1')
      // Second call while first is in-flight — must be ignored
      await store.assign('role-2')

      resolveFirst()
      await p1

      // assignRole should have been called exactly once
      expect(assignRole).toHaveBeenCalledTimes(1)
      expect(assignRole).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        userId: 'u-1',
        roleId: 'role-1',
      })
    })
  })

  describe('revoke', () => {
    it('calls revokeRole with userId + roleId then refetches', async () => {
      vi.mocked(revokeRole).mockResolvedValueOnce(undefined)
      vi.mocked(listUserRoles).mockResolvedValueOnce([mkRole({ id: 'role-2', name: 'viewer' })])

      const store = usePoliciesStore()
      store.userId = 'u-1'
      await store.revoke('role-1')

      expect(revokeRole).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        userId: 'u-1',
        roleId: 'role-1',
      })
      expect(listUserRoles).toHaveBeenCalledWith('u-1')
    })

    it('throws TenantUnavailableError and does NOT call the API when no tenant in session', async () => {
      useAuthStore().tenantId = null
      const store = usePoliciesStore()
      store.userId = 'u-1'

      await expect(store.revoke('role-1')).rejects.toBeInstanceOf(TenantUnavailableError)
      expect(revokeRole).not.toHaveBeenCalled()
      expect(store.mutating).toBe(false)
    })

    it('re-throws on failure and does NOT set errorKey', async () => {
      vi.mocked(revokeRole).mockRejectedValueOnce(new Error('revoke failed'))

      const store = usePoliciesStore()
      store.userId = 'u-1'
      await expect(store.revoke('role-1')).rejects.toThrow('revoke failed')
      expect(store.errorKey).toBeNull()
    })

    it('does not refetch when revoke fails', async () => {
      vi.mocked(revokeRole).mockRejectedValueOnce(new Error('fail'))

      const store = usePoliciesStore()
      store.userId = 'u-1'
      await expect(store.revoke('role-1')).rejects.toThrow()
      expect(listUserRoles).not.toHaveBeenCalled()
    })

    it('resets mutating to false after revoke failure', async () => {
      vi.mocked(revokeRole).mockRejectedValueOnce(new Error('fail'))
      const store = usePoliciesStore()
      store.userId = 'u-1'
      await expect(store.revoke('role-1')).rejects.toThrow()
      expect(store.mutating).toBe(false)
    })

    it('concurrent revoke is a no-op while first is in-flight (P-F2)', async () => {
      let resolveFirst!: () => void
      vi.mocked(revokeRole).mockReturnValueOnce(
        new Promise<void>((res) => {
          resolveFirst = res
        }),
      )
      vi.mocked(listUserRoles).mockResolvedValue([mkRole()])

      const store = usePoliciesStore()
      store.userId = 'u-1'

      const p1 = store.revoke('role-1')
      await store.revoke('role-2')

      resolveFirst()
      await p1

      expect(revokeRole).toHaveBeenCalledTimes(1)
      expect(revokeRole).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        userId: 'u-1',
        roleId: 'role-1',
      })
    })
  })
})
