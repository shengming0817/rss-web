/**
 * Smart Groups — STATIC group definitions, REAL membership.
 *
 * Preview-level feature: the group rules (predicate sets) are hand-authored
 * here, but membership is evaluated live against the real CELL_MANIFEST using
 * only derivable cell fields — no fabricated runtime metrics (QPS / health /
 * p95). This keeps the preview honest: every member shown is a real cell that
 * actually satisfies the predicate. Names/descriptions are i18n keys.
 */

import type { CellEntry } from '../manifest/types'

/** Cell fields a predicate can match against — all derivable from the manifest. */
export type CellField =
  | 'domain'
  | 'tier'
  | 'durability'
  | 'dependsOnCount'
  | 'producesCount'
  | 'consumesCount'

export type PredicateOp = 'eq' | 'neq' | 'gte' | 'lte' | 'gt' | 'lt'

export interface Predicate {
  readonly field: CellField
  readonly op: PredicateOp
  readonly value: string | number
}

export interface SmartGroup {
  readonly id: string
  /** i18n key for the group name. */
  readonly nameKey: string
  /** i18n key for the group description. */
  readonly descKey: string
  /** AND-combined predicates. */
  readonly predicates: readonly Predicate[]
}

export const SMART_GROUPS: readonly SmartGroup[] = [
  {
    id: 'sg-access',
    nameKey: 'groups.defs.access.name',
    descKey: 'groups.defs.access.desc',
    predicates: [{ field: 'domain', op: 'eq', value: 'Access' }],
  },
  {
    id: 'sg-strong-consistency',
    nameKey: 'groups.defs.strongConsistency.name',
    descKey: 'groups.defs.strongConsistency.desc',
    predicates: [{ field: 'tier', op: 'eq', value: 'L3' }],
  },
  {
    id: 'sg-foundation',
    nameKey: 'groups.defs.foundation.name',
    descKey: 'groups.defs.foundation.desc',
    predicates: [{ field: 'dependsOnCount', op: 'eq', value: 0 }],
  },
  {
    id: 'sg-high-fanin',
    nameKey: 'groups.defs.highFanin.name',
    descKey: 'groups.defs.highFanin.desc',
    predicates: [{ field: 'consumesCount', op: 'gte', value: 5 }],
  },
  {
    id: 'sg-durable',
    nameKey: 'groups.defs.durable.name',
    descKey: 'groups.defs.durable.desc',
    predicates: [{ field: 'durability', op: 'eq', value: 'durable' }],
  },
]

/** Resolve a derivable field value for a cell. */
export function cellFieldValue(cell: CellEntry, field: CellField): string | number {
  switch (field) {
    case 'domain':
      return cell.domain
    case 'tier':
      return cell.consistencyLevel
    case 'durability':
      return cell.durabilityMode
    case 'dependsOnCount':
      return cell.dependsOnCells.length
    case 'producesCount':
      return cell.produces.length
    case 'consumesCount':
      return cell.consumes.length
  }
}

/** Evaluate a single predicate against a cell. */
export function evalPredicate(cell: CellEntry, predicate: Predicate): boolean {
  const actual = cellFieldValue(cell, predicate.field)
  const { op, value } = predicate
  switch (op) {
    case 'eq':
      return actual === value
    case 'neq':
      return actual !== value
    case 'gte':
      return typeof actual === 'number' && typeof value === 'number' && actual >= value
    case 'lte':
      return typeof actual === 'number' && typeof value === 'number' && actual <= value
    case 'gt':
      return typeof actual === 'number' && typeof value === 'number' && actual > value
    case 'lt':
      return typeof actual === 'number' && typeof value === 'number' && actual < value
  }
}

/** Cells that satisfy ALL of a group's predicates (real membership). */
export function groupMembers(group: SmartGroup, cells: readonly CellEntry[]): CellEntry[] {
  return cells.filter((cell) => group.predicates.every((p) => evalPredicate(cell, p)))
}
