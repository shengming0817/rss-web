import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { CellEntry } from '../manifest/types'

export interface CellsFilterResult {
  /** The current free-text search query. */
  readonly query: Ref<string>
  /** The currently selected domain, or 'all'. */
  readonly domain: Ref<string>
  /** 'all' followed by unique sorted domain names derived from cells. */
  readonly domains: ComputedRef<readonly string[]>
  /** Cells passing both the domain filter and the query filter. */
  readonly filtered: ComputedRef<readonly CellEntry[]>
}

/**
 * useCellsFilter — pure filtering composable for the Cells list page.
 *
 * @param cells - Reactive list of all CellEntry items to filter.
 * @returns Reactive filter state + derived filtered list.
 */
export function useCellsFilter(
  cells: Ref<readonly CellEntry[]> | ComputedRef<readonly CellEntry[]>,
): CellsFilterResult {
  const query = ref('')
  const domain = ref('all')

  const domains = computed<readonly string[]>(() => {
    const unique = [...new Set(cells.value.map((c) => c.domain))].sort()
    return ['all', ...unique]
  })

  const filtered = computed<readonly CellEntry[]>(() => {
    const q = query.value.toLowerCase()
    return cells.value.filter((c) => {
      const domainMatch = domain.value === 'all' || c.domain === domain.value
      const queryMatch =
        q === '' || c.id.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
      return domainMatch && queryMatch
    })
  })

  return { query, domain, domains, filtered }
}
