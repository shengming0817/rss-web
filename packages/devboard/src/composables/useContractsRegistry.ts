import { computed, readonly, ref, type Ref, type ComputedRef } from 'vue'
import { useCellsStore } from '../stores/useCellsStore'
import type { CellEntry } from '../manifest/types'

/**
 * Contract registry — derived view of the platform's contract topology.
 *
 * The registry is built entirely from the static CELL_MANIFEST: each cell's
 * `produces` (role serve|publish) and `consumes` (role call|subscribe) are
 * aggregated by contract id into the set of serving cells and calling cells.
 * No backend call — this is real, derivable data (governance gates and typed
 * response envelopes, which are NOT derivable, live in src/data as labelled
 * static snapshots).
 */

export type ContractKind = 'http' | 'event'
export type ContractKindFilter = ContractKind | 'all'

export interface ContractRegistryEntry {
  readonly contract: string
  /** Transport kind, derived from the contract id prefix. */
  readonly kind: ContractKind
  /** Cells that serve/publish this contract, sorted by id. */
  readonly servers: readonly string[]
  /** Cells that call/subscribe to this contract, sorted by id. */
  readonly callers: readonly string[]
}

/** Classify a contract by its id prefix (`event.*` → event, else http). */
export function contractKind(contract: string): ContractKind {
  return contract.startsWith('event.') ? 'event' : 'http'
}

/**
 * Aggregate every cell's produces/consumes into one registry entry per
 * contract id. Pure function — the single place the derivation lives, so it
 * can be unit-tested against fixtures without a Pinia instance.
 */
export function buildContractRegistry(cells: readonly CellEntry[]): ContractRegistryEntry[] {
  const servers = new Map<string, Set<string>>()
  const callers = new Map<string, Set<string>>()

  const add = (m: Map<string, Set<string>>, contract: string, cellId: string): void => {
    let set = m.get(contract)
    if (!set) {
      set = new Set<string>()
      m.set(contract, set)
    }
    set.add(cellId)
  }

  for (const cell of cells) {
    for (const usage of cell.produces) add(servers, usage.contract, cell.id)
    for (const usage of cell.consumes) add(callers, usage.contract, cell.id)
  }

  const all = new Set<string>([...servers.keys(), ...callers.keys()])
  return [...all]
    .sort((a, b) => a.localeCompare(b))
    .map((contract) => ({
      contract,
      kind: contractKind(contract),
      servers: [...(servers.get(contract) ?? [])].sort((a, b) => a.localeCompare(b)),
      callers: [...(callers.get(contract) ?? [])].sort((a, b) => a.localeCompare(b)),
    }))
}

export interface UseContractsRegistry {
  /** The full registry, sorted by contract id. */
  readonly registry: ComputedRef<readonly ContractRegistryEntry[]>
  /** Free-text search across contract id / server / caller. */
  readonly query: Ref<string>
  /** Filter by transport kind. */
  readonly kindFilter: Ref<ContractKindFilter>
  /** Registry filtered by query + kind. */
  readonly filtered: ComputedRef<readonly ContractRegistryEntry[]>
  /** The contract id currently selected for the detail panel, or null. */
  readonly selectedContract: Readonly<Ref<string | null>>
  /** The selected registry entry, or null. */
  readonly selectedEntry: ComputedRef<ContractRegistryEntry | null>
  /** Select (or clear) the detail contract. */
  select(contract: string | null): void
}

export function useContractsRegistry(): UseContractsRegistry {
  const store = useCellsStore()
  const registry = computed(() => buildContractRegistry(store.cells))

  const query = ref('')
  const kindFilter = ref<ContractKindFilter>('all')
  const selectedContract = ref<string | null>(null)

  const filtered = computed<readonly ContractRegistryEntry[]>(() => {
    const q = query.value.trim().toLowerCase()
    return registry.value.filter((entry) => {
      if (kindFilter.value !== 'all' && entry.kind !== kindFilter.value) return false
      if (q === '') return true
      return (
        entry.contract.toLowerCase().includes(q) ||
        entry.servers.some((s) => s.toLowerCase().includes(q)) ||
        entry.callers.some((c) => c.toLowerCase().includes(q))
      )
    })
  })

  const selectedEntry = computed<ContractRegistryEntry | null>(() => {
    if (selectedContract.value === null) return null
    return registry.value.find((e) => e.contract === selectedContract.value) ?? null
  })

  function select(contract: string | null): void {
    selectedContract.value = contract
  }

  return {
    registry,
    query,
    kindFilter,
    filtered,
    selectedContract: readonly(selectedContract),
    selectedEntry,
    select,
  }
}
