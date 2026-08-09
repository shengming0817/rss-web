import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import { toI18nKey } from '@gocell/request'
import type {
  HttpConfigFlagsCreateV1Request,
  HttpConfigFlagsUpdateV1Request,
  HttpConfigFlagsToggleV1Request,
} from '@gocell/contracts'
import {
  listFlags,
  createFlag,
  updateFlag,
  toggleFlag,
  deleteFlag,
  type FeatureFlag,
} from '../api/flags'

/** Server page size for the cursor-paginated flags list. */
const PAGE_SIZE = 50

/**
 * config.flags — feature flag state.
 *
 * Owns server-list state (flags, cursor, loading, error) + a client-side
 * key quick-filter, plus the mutation actions backing the modal/dialogs.
 *
 * List fetches swallow errors into `errorKey` (rendered inline on the page).
 * Mutations DO NOT swallow — they re-throw so the triggering modal can show
 * the error and stay open; on success they re-fetch the list as source of truth.
 *
 * Kill switch: toggle(key, { enabled: false, expectedVersion }) calls the
 * partial /toggle endpoint. CAS 409 ERR_VERSION_CONFLICT → re-thrown.
 *
 * Rollout %: update() with full payload (enabled + rolloutPercentage + description).
 *
 * Variant config: flag `type` is a free backend string, read-only in UI.
 * Variant payload is not available in the current API (BR-007 pending).
 *
 * useFlag() consumes isEnabled() for runtime flag checks — NOT /evaluate.
 */
export const useFlagsStore = defineStore('config.flags', () => {
  // ─── state ──────────────────────────────────────────────────────────────
  const flags = shallowRef<FeatureFlag[]>([])
  const loading = ref(false)
  const errorKey = ref<string | null>(null)
  const nextCursor = ref('')
  const hasMore = ref(false)
  /** Client-side quick-filter over the loaded page (by key). */
  const filter = ref('')
  const mutating = ref(false)

  // ─── getters ────────────────────────────────────────────────────────────
  const filteredFlags = computed<FeatureFlag[]>(() => {
    const q = filter.value.trim().toLowerCase()
    if (!q) return flags.value
    return flags.value.filter((f) => f.key.toLowerCase().includes(q))
  })

  /** O(1) lookup map: key → enabled. Recomputed when flags array reference changes. */
  const flagMap = computed(() => new Map(flags.value.map((f) => [f.key, f.enabled])))

  /**
   * Synchronous enabled check for a flag by key.
   * Used by useFlag() composable — consumes the list cache, no HTTP.
   * Returns false (fail-safe) when the key is not in the current cache.
   */
  function isEnabled(key: string): boolean {
    return flagMap.value.get(key) ?? false
  }

  // ─── read actions ───────────────────────────────────────────────────────

  /** Fetch the first page, replacing any current flags. */
  async function fetchList(): Promise<void> {
    loading.value = true
    errorKey.value = null
    try {
      const page = await listFlags({ limit: PAGE_SIZE })
      flags.value = page.data
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
      const page = await listFlags({ cursor: nextCursor.value, limit: PAGE_SIZE })
      flags.value = [...flags.value, ...page.data]
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
   * pages the user expanded via loadMore. Errors surface inline.
   */
  async function refreshLoaded(): Promise<void> {
    const limit = Math.max(flags.value.length, PAGE_SIZE)
    loading.value = true
    errorKey.value = null
    try {
      const page = await listFlags({ limit })
      flags.value = page.data
      nextCursor.value = page.nextCursor
      hasMore.value = page.hasMore
    } catch (err: unknown) {
      errorKey.value = toI18nKey(err)
    } finally {
      loading.value = false
    }
  }

  // ─── mutation actions (re-throw on failure; refresh on success) ──────────

  /** Create a new feature flag. Re-throws on failure; refreshes list on success. */
  async function create(body: HttpConfigFlagsCreateV1Request): Promise<void> {
    if (mutating.value) return
    mutating.value = true
    try {
      await createFlag(body)
      await refreshLoaded()
    } finally {
      mutating.value = false
    }
  }

  /**
   * Update an existing flag with CAS guard (full replacement: enabled + rollout + description).
   * Use for rollout% changes. 409 ERR_VERSION_CONFLICT → re-thrown.
   */
  async function update(key: string, body: HttpConfigFlagsUpdateV1Request): Promise<void> {
    if (mutating.value) return
    mutating.value = true
    try {
      await updateFlag(key, body)
      await refreshLoaded()
    } finally {
      mutating.value = false
    }
  }

  /**
   * Toggle the enabled state with CAS guard (partial flip via /toggle endpoint).
   * Kill switch: pass enabled=false. 409 ERR_VERSION_CONFLICT → re-thrown.
   */
  async function toggle(key: string, body: HttpConfigFlagsToggleV1Request): Promise<void> {
    if (mutating.value) return
    mutating.value = true
    try {
      await toggleFlag(key, body)
      await refreshLoaded()
    } finally {
      mutating.value = false
    }
  }

  /** Delete a feature flag. Re-throws on failure; refreshes list on success. */
  async function remove(key: string): Promise<void> {
    if (mutating.value) return
    mutating.value = true
    try {
      await deleteFlag(key)
      await refreshLoaded()
    } finally {
      mutating.value = false
    }
  }

  return {
    // state
    flags,
    loading,
    errorKey,
    nextCursor,
    hasMore,
    filter,
    mutating,
    // getters
    filteredFlags,
    isEnabled,
    // read actions
    fetchList,
    loadMore,
    // mutation actions
    create,
    update,
    toggle,
    remove,
  }
})
