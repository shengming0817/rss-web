import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import { toI18nKey } from '@gocell/request'
import type {
  HttpConfigWriteV1Request,
  HttpConfigUpdateV1Request,
  HttpConfigRollbackV1Request,
} from '@gocell/contracts'
import {
  listConfig,
  writeConfig,
  updateConfig,
  deleteConfig,
  publishConfig,
  rollbackConfig,
  type ConfigEntry,
  type PublishSnapshot,
} from '../api/config'
import { isRedactedPlaceholder } from '../lib/configValidation'

/** Server page size for the cursor-paginated config list. */
const PAGE_SIZE = 50

/**
 * config.entries — config entry state.
 *
 * Owns server-list state (entries, cursor, loading, error) + a client-side
 * key quick-filter, plus the mutation actions backing the drawer/dialogs.
 *
 * List fetches swallow errors into `errorKey` (rendered inline on the page).
 * Mutations DO NOT swallow — they re-throw so the triggering modal can show
 * the error and stay open; on success they re-fetch the list as source of truth.
 *
 * Sensitive write guard: create/update reject if value === "******" (backend
 * redaction placeholder) — the user must supply an actual new value.
 *
 * No version-history endpoint (BR-008 pending): rollback takes a caller-supplied
 * target version number.
 */
export const useConfigStore = defineStore('config.entries', () => {
  // ─── state ──────────────────────────────────────────────────────────────
  const entries = shallowRef<ConfigEntry[]>([])
  const loading = ref(false)
  const errorKey = ref<string | null>(null)
  const nextCursor = ref('')
  const hasMore = ref(false)
  /** Client-side quick-filter over the loaded page (by key). */
  const filter = ref('')
  const mutating = ref(false)

  // ─── getters ────────────────────────────────────────────────────────────
  const filteredEntries = computed<ConfigEntry[]>(() => {
    const q = filter.value.trim().toLowerCase()
    if (!q) return entries.value
    return entries.value.filter((e) => e.key.toLowerCase().includes(q))
  })

  // ─── read actions ───────────────────────────────────────────────────────

  /** Fetch the first page, replacing any current entries. */
  async function fetchList(): Promise<void> {
    loading.value = true
    errorKey.value = null
    try {
      const page = await listConfig({ limit: PAGE_SIZE })
      entries.value = page.data
      nextCursor.value = page.nextCursor
      hasMore.value = page.hasMore
    } catch (err: unknown) {
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
      const page = await listConfig({ cursor: nextCursor.value, limit: PAGE_SIZE })
      entries.value = [...entries.value, ...page.data]
      nextCursor.value = page.nextCursor
      hasMore.value = page.hasMore
    } catch (err: unknown) {
      errorKey.value = toI18nKey(err)
    } finally {
      loading.value = false
    }
  }

  /**
   * Re-fetch the rows currently in view so a mutation never silently collapses
   * pages the user expanded via loadMore. Errors surface inline like fetchList.
   */
  async function refreshLoaded(): Promise<void> {
    const limit = Math.max(entries.value.length, PAGE_SIZE)
    loading.value = true
    errorKey.value = null
    try {
      const page = await listConfig({ limit })
      entries.value = page.data
      nextCursor.value = page.nextCursor
      hasMore.value = page.hasMore
    } catch (err: unknown) {
      errorKey.value = toI18nKey(err)
    } finally {
      loading.value = false
    }
  }

  // ─── mutation actions (re-throw on failure; refresh on success) ──────────

  /**
   * Create a new config entry.
   * Sensitive write guard: rejects immediately if body.value is the redacted placeholder.
   */
  async function create(body: HttpConfigWriteV1Request): Promise<void> {
    if (isRedactedPlaceholder(body.value)) {
      throw new Error('config.entries.validation.value.sensitiveRedacted')
    }
    if (mutating.value) return
    mutating.value = true
    try {
      await writeConfig(body)
      await refreshLoaded()
    } finally {
      mutating.value = false
    }
  }

  /**
   * Update an existing config entry with CAS guard.
   * Sensitive write guard: rejects immediately if body.value is the redacted placeholder.
   * 409 ERR_VERSION_CONFLICT → re-thrown for the drawer to surface inline.
   */
  async function update(key: string, body: HttpConfigUpdateV1Request): Promise<void> {
    if (isRedactedPlaceholder(body.value)) {
      throw new Error('config.entries.validation.value.sensitiveRedacted')
    }
    if (mutating.value) return
    mutating.value = true
    try {
      await updateConfig(key, body)
      await refreshLoaded()
    } finally {
      mutating.value = false
    }
  }

  /**
   * Publish the current entry state as a snapshot.
   * Re-throws on failure; refreshes the list on success.
   */
  async function publish(key: string): Promise<PublishSnapshot> {
    if (mutating.value) return Promise.reject(new Error('mutating'))
    mutating.value = true
    try {
      const snap = await publishConfig(key)
      await refreshLoaded()
      return snap
    } finally {
      mutating.value = false
    }
  }

  /**
   * Rollback to a prior version with CAS guard.
   * No version-history endpoint (BR-008 pending): caller supplies target version.
   * 409 ERR_VERSION_CONFLICT → re-thrown for the dialog to surface inline.
   */
  async function rollback(key: string, body: HttpConfigRollbackV1Request): Promise<void> {
    if (mutating.value) return
    mutating.value = true
    try {
      await rollbackConfig(key, body)
      await refreshLoaded()
    } finally {
      mutating.value = false
    }
  }

  /** Delete a config entry. Re-throws on failure; refreshes the list on success. */
  async function remove(key: string): Promise<void> {
    if (mutating.value) return
    mutating.value = true
    try {
      await deleteConfig(key)
      await refreshLoaded()
    } finally {
      mutating.value = false
    }
  }

  return {
    // state
    entries,
    loading,
    errorKey,
    nextCursor,
    hasMore,
    filter,
    mutating,
    // getters
    filteredEntries,
    // read actions
    fetchList,
    loadMore,
    // mutation actions
    create,
    update,
    publish,
    rollback,
    remove,
  }
})
