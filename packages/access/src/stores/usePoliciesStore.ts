import { defineStore } from 'pinia'
import { ref } from 'vue'
import { toI18nKey } from '@gocell/request'
import { listUserRoles, assignRole, revokeRole, type Role } from '../api/roles'
import { useAuthStore } from './useAuthStore'

/**
 * Thrown by assign / revoke when no tenant is in session, so the backend's
 * now-required `tenantId` cannot be supplied. The caller catches it to show a
 * dedicated inline message instead of firing a request that would 400. The
 * tenant becomes available once the backend exposes it in the session contract
 * (BR-009); until then role mutations degrade gracefully rather than send a
 * fabricated value.
 */
export class TenantUnavailableError extends Error {
  constructor() {
    super('No tenant in session — role mutation unavailable')
    this.name = 'TenantUnavailableError'
  }
}

/**
 * access.policies — per-user role-binding state (Batch 3 RBAC slice).
 *
 * Owns the role list for a selected user, plus assign / revoke mutations
 * that back the RBAC assignment panel.
 *
 * Read actions (fetchRoles) swallow errors into `errorKey` so the panel
 * can display an inline error without crashing. Mutation actions (assign /
 * revoke) DO NOT swallow — they re-throw so the triggering control can show
 * an inline error and stay open; on success they re-fetch the user's roles.
 */

export const usePoliciesStore = defineStore('access.policies', () => {
  // accesscore role mutations are tenant-scoped; the tenant comes from the
  // session (auth store). See assign / revoke + TenantUnavailableError.
  const auth = useAuthStore()
  // Generation counter lives inside the factory so it resets when a fresh
  // Pinia recreates the store (avoids cross-test coupling, P-F2).
  let generation = 0
  // ─── state ──────────────────────────────────────────────────────────────
  const userId = ref('')
  const roles = ref<Role[]>([])
  const loading = ref(false)
  const errorKey = ref<string | null>(null)
  const mutating = ref(false)

  // ─── read actions ───────────────────────────────────────────────────────

  /**
   * Fetch roles assigned to `id`. If id is blank, clears the role list and
   * returns immediately without making a network request.
   */
  async function fetchRoles(id: string): Promise<void> {
    if (!id.trim()) {
      roles.value = []
      return
    }
    const gen = ++generation
    userId.value = id
    loading.value = true
    errorKey.value = null
    try {
      const r = await listUserRoles(id)
      if (gen === generation) roles.value = r
    } catch (err: unknown) {
      // Keep prior roles on failure; surface the i18n key for inline display.
      if (gen === generation) errorKey.value = toI18nKey(err)
    } finally {
      if (gen === generation) loading.value = false
    }
  }

  // ─── mutation actions (re-throw on failure; refresh on success) ──────────

  /**
   * Assign `roleId` to the current `userId`. Refreshes the role list on
   * success. Re-throws on failure — the calling UI is responsible for
   * surfacing the error inline and keeping the panel open.
   * Concurrent calls while in-flight are ignored (P-F2).
   */
  async function assign(roleId: string): Promise<void> {
    if (mutating.value) return
    const tenantId = auth.tenantId
    if (tenantId === null) throw new TenantUnavailableError()
    mutating.value = true
    try {
      await assignRole({ tenantId, userId: userId.value, roleId })
      await fetchRoles(userId.value)
    } finally {
      mutating.value = false
    }
  }

  /**
   * Revoke `roleId` from the current `userId`. Symmetric with `assign`:
   * refreshes on success, re-throws on failure.
   * Concurrent calls while in-flight are ignored (P-F2).
   */
  async function revoke(roleId: string): Promise<void> {
    if (mutating.value) return
    const tenantId = auth.tenantId
    if (tenantId === null) throw new TenantUnavailableError()
    mutating.value = true
    try {
      await revokeRole({ tenantId, userId: userId.value, roleId })
      await fetchRoles(userId.value)
    } finally {
      mutating.value = false
    }
  }

  return {
    // state
    userId,
    roles,
    loading,
    errorKey,
    mutating,
    // read actions
    fetchRoles,
    // mutation actions
    assign,
    revoke,
  }
})
