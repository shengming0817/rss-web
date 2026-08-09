import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { toI18nKey } from '@gocell/request'
import type {
  HttpAuthUserCreateV1Request,
  HttpAuthUserPatchV1Request,
  HttpAuthUserChangePasswordV1Request,
} from '@gocell/contracts'
import {
  listUsers,
  createUser,
  patchUser,
  deleteUser,
  lockUser,
  unlockUser,
  changeUserPassword,
  type Identity,
} from '../api/identities'

/** Server page size for the cursor-paginated user list (BR-005). */
const PAGE_SIZE = 50

/**
 * access.identities — user-identity state (MVP: `type=user`).
 *
 * Owns server-list state (rows, cursor, loading, error) + a client-side
 * quick-filter, plus the mutation actions backing the operation modals.
 *
 * List fetches swallow errors into `errorKey` (rendered inline on the page).
 * Mutations DO NOT swallow — they re-throw so the triggering modal can show the
 * error and stay open; on success they re-fetch the list as the source of truth.
 */
export const useIdentitiesStore = defineStore('access.identities', () => {
  // ─── state ──────────────────────────────────────────────────────────────
  const users = ref<Identity[]>([])
  const loading = ref(false)
  const errorKey = ref<string | null>(null)
  const nextCursor = ref('')
  const hasMore = ref(false)
  /** Client-side quick-filter over the loaded page (BR-005: no server filter yet). */
  const filter = ref('')

  // ─── getters ────────────────────────────────────────────────────────────
  const filteredUsers = computed<Identity[]>(() => {
    const q = filter.value.trim().toLowerCase()
    if (!q) return users.value
    return users.value.filter(
      (u) => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    )
  })

  // ─── read actions ───────────────────────────────────────────────────────

  /** Fetch the first page, replacing any current rows. */
  async function fetchList(): Promise<void> {
    loading.value = true
    errorKey.value = null
    try {
      const page = await listUsers({ limit: PAGE_SIZE })
      users.value = page.data
      nextCursor.value = page.nextCursor
      hasMore.value = page.hasMore
    } catch (err: unknown) {
      // Keep the last good rows on a refetch failure; surface the i18n key.
      errorKey.value = toI18nKey(err)
    } finally {
      loading.value = false
    }
  }

  /** Append the next page; no-op when there is none or a request is in flight. */
  async function loadMore(): Promise<void> {
    if (!hasMore.value || loading.value) return
    loading.value = true
    errorKey.value = null
    try {
      const page = await listUsers({ cursor: nextCursor.value, limit: PAGE_SIZE })
      users.value = [...users.value, ...page.data]
      nextCursor.value = page.nextCursor
      hasMore.value = page.hasMore
    } catch (err: unknown) {
      errorKey.value = toI18nKey(err)
    } finally {
      loading.value = false
    }
  }

  /**
   * Re-fetch the rows currently in view (not just page 1) so a mutation never
   * silently collapses pages the user expanded via loadMore. One request, fresh
   * server truth, no optimistic drift. Errors surface inline like fetchList.
   */
  async function refreshLoaded(): Promise<void> {
    const limit = Math.max(users.value.length, PAGE_SIZE)
    loading.value = true
    errorKey.value = null
    try {
      const page = await listUsers({ limit })
      users.value = page.data
      nextCursor.value = page.nextCursor
      hasMore.value = page.hasMore
    } catch (err: unknown) {
      errorKey.value = toI18nKey(err)
    } finally {
      loading.value = false
    }
  }

  // ─── mutation actions (re-throw on failure; refresh loaded extent on success) ──

  async function create(body: HttpAuthUserCreateV1Request): Promise<void> {
    await createUser(body)
    await refreshLoaded()
  }

  async function edit(id: string, body: HttpAuthUserPatchV1Request): Promise<void> {
    await patchUser(id, body)
    await refreshLoaded()
  }

  async function lock(id: string): Promise<void> {
    await lockUser(id)
    await refreshLoaded()
  }

  async function unlock(id: string): Promise<void> {
    await unlockUser(id)
    await refreshLoaded()
  }

  async function remove(id: string): Promise<void> {
    await deleteUser(id)
    await refreshLoaded()
  }

  /** Change password — no list refetch (the row's visible fields don't change). */
  async function changePassword(
    id: string,
    body: HttpAuthUserChangePasswordV1Request,
  ): Promise<void> {
    await changeUserPassword(id, body)
  }

  return {
    // state
    users,
    loading,
    errorKey,
    nextCursor,
    hasMore,
    filter,
    // getters
    filteredUsers,
    // read actions
    fetchList,
    loadMore,
    // mutation actions
    create,
    edit,
    lock,
    unlock,
    remove,
    changePassword,
  }
})
