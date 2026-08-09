import { defineStore } from 'pinia'
import { shallowRef, ref, computed } from 'vue'
import { toI18nKey } from '@gocell/request'
import { fetchCellHealth } from '../api/health'
import type { CellHealthEntry, HealthSummary } from '../api/health'
import { fetchSystemInfo } from '../api/system'
import type { SystemInfoResponse } from '../api/system'
import { rollupCells } from '../lib/healthStatus'
import type { HealthRollup } from '../lib/healthStatus'
import type { LoadStatus } from '../lib/loadStatus'

/**
 * observe.health — cell health + system info state.
 *
 * Both sub-domains degrade independently: a 404 on /health/cells leaves
 * systemStatus untouched and vice versa. refresh() fans out both in parallel
 * via Promise.allSettled so one failure never blocks the other.
 */
export const useHealthStore = defineStore('observe.health', () => {
  // ─── cell health state ────────────────────────────────────────────────────
  // shallowRef: cell array is replaced wholesale on each fetch; no in-place mutation.
  const cells = shallowRef<CellHealthEntry[]>([])
  const summary = ref<HealthSummary | null>(null)
  const healthStatus = ref<LoadStatus>('idle')
  const healthErrorKey = ref<string | null>(null)

  // ─── system info state ────────────────────────────────────────────────────
  const system = ref<SystemInfoResponse | null>(null)
  const systemStatus = ref<LoadStatus>('idle')
  const systemErrorKey = ref<string | null>(null)

  // ─── shared metadata ──────────────────────────────────────────────────────
  const lastCheckAt = ref<string | null>(null)

  // ─── getter ───────────────────────────────────────────────────────────────
  const rollup = computed<HealthRollup>(() => rollupCells(cells.value))

  // ─── in-flight promise deduplication ─────────────────────────────────────
  // Prevents concurrent calls (e.g. manual refresh racing a polling tick) from
  // leaving the store in an indeterminate state via stale responses overwriting
  // the newer request's result.
  let healthInflight: Promise<void> | null = null
  let systemInflight: Promise<void> | null = null

  // ─── actions ──────────────────────────────────────────────────────────────

  /** Fetch cell health snapshot; degrades to 'unavailable' on any error. */
  function fetchHealth(): Promise<void> {
    if (healthInflight !== null) return healthInflight
    healthStatus.value = 'loading'
    healthErrorKey.value = null
    healthInflight = (async () => {
      try {
        const r = await fetchCellHealth()
        cells.value = r.cells
        summary.value = r.summary
        lastCheckAt.value = r.summary.lastCheckAt
        healthStatus.value = 'loaded'
      } catch (err: unknown) {
        healthErrorKey.value = toI18nKey(err)
        healthStatus.value = 'unavailable'
      } finally {
        healthInflight = null
      }
    })()
    return healthInflight
  }

  /** Fetch system info snapshot; degrades to 'unavailable' on any error. */
  function fetchSystem(): Promise<void> {
    if (systemInflight !== null) return systemInflight
    systemStatus.value = 'loading'
    systemErrorKey.value = null
    systemInflight = (async () => {
      try {
        const r = await fetchSystemInfo()
        system.value = r
        systemStatus.value = 'loaded'
      } catch (err: unknown) {
        systemErrorKey.value = toI18nKey(err)
        systemStatus.value = 'unavailable'
      } finally {
        systemInflight = null
      }
    })()
    return systemInflight
  }

  /**
   * Refresh both health and system concurrently.
   * One failure never blocks the other — Promise.allSettled.
   */
  async function refresh(): Promise<void> {
    await Promise.allSettled([fetchHealth(), fetchSystem()])
  }

  return {
    // state
    cells,
    summary,
    healthStatus,
    healthErrorKey,
    system,
    systemStatus,
    systemErrorKey,
    lastCheckAt,
    // getter
    rollup,
    // actions
    fetchHealth,
    fetchSystem,
    refresh,
  }
})
