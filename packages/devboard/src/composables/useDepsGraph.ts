import { computed, readonly, ref, type Ref, type ComputedRef } from 'vue'
import { useCellsStore } from '../stores/useCellsStore'
import type { CellEntry } from '../manifest/types'

/**
 * Cell dependency graph — derived from the static CELL_MANIFEST.
 *
 * `dependsOnCells` is the canonical edge source (cross-cell consume→produce
 * resolution done at manifest-generation time); `requiredByCells` is its
 * mirror. The four explorer views (list / graph / tree / matrix) all project
 * this single edge set — no backend, no `go mod graph`, just the real cell
 * topology the manifest already carries.
 */

export interface DependencyEdge {
  /** The dependent cell. */
  readonly from: string
  /** The cell being depended upon. */
  readonly to: string
}

export interface DependencyTreeNode {
  readonly id: string
  readonly children: readonly DependencyTreeNode[]
}

/** Flatten every cell's `dependsOnCells` into a sorted edge list. */
export function buildDependencyEdges(cells: readonly CellEntry[]): DependencyEdge[] {
  const edges: DependencyEdge[] = []
  for (const cell of cells) {
    for (const to of cell.dependsOnCells) edges.push({ from: cell.id, to })
  }
  return edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
}

/**
 * Build a dependency forest. Roots are cells nothing else depends on
 * (`requiredByCells` empty) — the top of the dependency chains; each node's
 * children are its `dependsOnCells`. A path set guards against cycles. Falls
 * back to all cells as roots if every cell is depended upon (pure cycle).
 */
export function buildDependencyForest(cells: readonly CellEntry[]): DependencyTreeNode[] {
  const byId = new Map<string, CellEntry>(cells.map((c) => [c.id, c]))
  const rootCells = cells.filter((c) => c.requiredByCells.length === 0)
  const roots = rootCells.length > 0 ? rootCells : cells

  const build = (id: string, path: ReadonlySet<string>): DependencyTreeNode => {
    const cell = byId.get(id)
    if (!cell || path.has(id)) return { id, children: [] }
    const next = new Set(path)
    next.add(id)
    return {
      id,
      children: [...cell.dependsOnCells]
        .sort((a, b) => a.localeCompare(b))
        .map((dep) => build(dep, next)),
    }
  }

  return roots.map((r) => build(r.id, new Set<string>())).sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * Build an O(1) `dependsOn(from, to)` predicate for the matrix view.
 */
export function buildDependsOnIndex(
  cells: readonly CellEntry[],
): (from: string, to: string) => boolean {
  const index = new Map<string, ReadonlySet<string>>(
    cells.map((c) => [c.id, new Set(c.dependsOnCells)]),
  )
  return (from, to) => index.get(from)?.has(to) ?? false
}

export interface UseDepsGraph {
  readonly cells: ComputedRef<readonly CellEntry[]>
  readonly edges: ComputedRef<readonly DependencyEdge[]>
  readonly forest: ComputedRef<readonly DependencyTreeNode[]>
  /** O(1) matrix predicate: does `from` depend on `to`? */
  readonly dependsOn: ComputedRef<(from: string, to: string) => boolean>
  readonly selectedCellId: Readonly<Ref<string | null>>
  readonly selectedCell: ComputedRef<CellEntry | null>
  select(id: string | null): void
}

export function useDepsGraph(): UseDepsGraph {
  const store = useCellsStore()
  const cells = computed(() => store.cells)
  const edges = computed(() => buildDependencyEdges(store.cells))
  const forest = computed(() => buildDependencyForest(store.cells))
  const dependsOn = computed(() => buildDependsOnIndex(store.cells))

  const selectedCellId = ref<string | null>(null)
  const selectedCell = computed<CellEntry | null>(() => {
    if (selectedCellId.value === null) return null
    return store.cells.find((c) => c.id === selectedCellId.value) ?? null
  })

  function select(id: string | null): void {
    selectedCellId.value = id
  }

  return {
    cells,
    edges,
    forest,
    dependsOn,
    selectedCellId: readonly(selectedCellId),
    selectedCell,
    select,
  }
}
