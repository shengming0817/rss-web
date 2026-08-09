import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { CELL_MANIFEST } from '../manifest/cells.generated'
import type { CellEntry } from '../manifest/types'
import { fetchCellAudit, type CellAuditEntry } from '../api/cellAudit'
import { fetchCellConfig, type CellConfigEntry } from '../api/cellConfig'

/** Load status for the cached recent-entries panels (Audit / Config tabs). */
type RecentLoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

/**
 * devboard.cells — cell manifest query state.
 *
 * Wraps the static CELL_MANIFEST (build-time derived from cell.yaml files)
 * with reactive selection state for the Cells detail panel.
 */
export const useCellsStore = defineStore('devboard.cells', () => {
  // ─── state ──────────────────────────────────────────────────────────────
  const selectedId = ref<string | null>(null)

  // id → entry lookup, derived once from the (static) manifest list. The
  // generated manifest ships only `cells`; the index is built here at runtime
  // rather than duplicating every entry into a second `byId` literal.
  const byIdMap = new Map<string, CellEntry>(CELL_MANIFEST.cells.map((c) => [c.id, c]))

  // ─── getters ────────────────────────────────────────────────────────────

  /** All cells from the manifest, sorted by id (as generated). */
  const cells = computed(() => CELL_MANIFEST.cells)

  /**
   * Look up a cell by id. Returns null if not found.
   * Exposed as a function rather than a computed map to allow
   * per-call usage without requiring the caller to unwrap a ref.
   */
  function byId(id: string): CellEntry | null {
    return byIdMap.get(id) ?? null
  }

  /** The currently selected cell, or null if none selected. */
  const selectedCell = computed<CellEntry | null>(() => {
    if (selectedId.value === null) return null
    return byIdMap.get(selectedId.value) ?? null
  })

  // ─── recent Audit/Config cache ────────────────────────────────────────────
  // The cell-detail view renders only the active tabpanel, so switching away
  // unmounts the Audit/Config tab and switching back remounts it. Caching the
  // recent-entries lists here (rather than fetching in each tab's onMounted)
  // means re-entry reuses the data instead of re-firing the request. The
  // backend has no per-cell filter (BR gap), so these are global recent
  // entries — a single session-level cache, no per-cell keying.

  const auditEntries = ref<CellAuditEntry[]>([])
  const auditStatus = ref<RecentLoadStatus>('idle')
  const configEntries = ref<CellConfigEntry[]>([])
  const configStatus = ref<RecentLoadStatus>('idle')

  // ─── actions ────────────────────────────────────────────────────────────

  function selectCell(id: string | null): void {
    selectedId.value = id
  }

  /** Fetch recent audit entries once per session; retries after an error. */
  async function loadRecentAudit(): Promise<void> {
    if (auditStatus.value === 'loading' || auditStatus.value === 'loaded') return
    auditStatus.value = 'loading'
    try {
      const res = await fetchCellAudit({ limit: 20 })
      auditEntries.value = res.data
      auditStatus.value = 'loaded'
    } catch {
      auditStatus.value = 'error'
    }
  }

  /** Fetch recent config entries once per session; retries after an error. */
  async function loadRecentConfig(): Promise<void> {
    if (configStatus.value === 'loading' || configStatus.value === 'loaded') return
    configStatus.value = 'loading'
    try {
      const res = await fetchCellConfig({ limit: 50 })
      configEntries.value = res.data
      configStatus.value = 'loaded'
    } catch {
      configStatus.value = 'error'
    }
  }

  return {
    // state
    selectedId,
    auditEntries,
    auditStatus,
    configEntries,
    configStatus,
    // getters
    cells,
    byId,
    selectedCell,
    // actions
    selectCell,
    loadRecentAudit,
    loadRecentConfig,
  }
})
