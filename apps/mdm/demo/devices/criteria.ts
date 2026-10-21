/** Synthetic server evaluation only. Browser components never calculate membership. */
import type {
  CollectionScope,
  InventoryCondition,
  Criteria,
  Inventory,
  ReadScalar,
} from '../../src/features/devices/clients/asset-model'
import { catalog } from './fixtures'
export type Evaluation = {
  outcome: 'match' | 'no_match' | 'null' | 'missing' | 'unsupported' | 'deleted' | 'conflict'
  path: number[]
}
export function referencedFields(criteria: Criteria): string[] {
  return criteria.kind === 'predicate'
    ? [criteria.field]
    : [...new Set(criteria.children.flatMap(referencedFields))]
}
export function evaluate(
  node: Criteria | null,
  device: Inventory,
  path: number[] = [],
): { decision: 'match' | 'no_match' | 'unknown'; explanations: Evaluation[] } {
  if (node === null) return { decision: 'match', explanations: [] }
  if (node.kind !== 'predicate') {
    const children = node.children.map((child, i) => evaluate(child, device, [...path, i]))
    const decisions = children.map((c) => c.decision)
    const decisive = node.kind === 'and' ? 'no_match' : 'match'
    const decision = decisions.includes(decisive)
      ? decisive
      : decisions.includes('unknown')
        ? 'unknown'
        : node.kind === 'and'
          ? 'match'
          : 'no_match'
    return { decision, explanations: children.flatMap((c) => c.explanations) }
  }
  const definition = catalog.find((f) => f.key === node.field)
  if (!definition || !definition.operations.includes(node.op)) throw new Error('Invalid condition')
  const operands = node.values ?? (node.value ? [node.value] : [])
  if (operands.some((s) => s.kind !== definition.kind)) throw new Error('Wrong operand type')
  const state = device.fields[node.field]?.state ?? { kind: 'missing' as const }
  if (state.kind !== 'known' && state.kind !== 'null')
    return { decision: 'unknown', explanations: [{ path, outcome: state.kind }] }
  if (state.kind === 'null' && node.op !== 'is_null' && node.op !== 'is_not_null')
    return { decision: 'unknown', explanations: [{ path, outcome: 'null' }] }
  let matches = false
  const same = (a: ReadScalar, b: ReadScalar) => a.kind === b.kind && a.value === b.value
  if (node.op === 'is_null') matches = state.kind === 'null'
  else if (node.op === 'is_not_null') matches = state.kind === 'known'
  else if (state.kind === 'known') {
    const value = state.value
    if (node.op === 'in' || node.op === 'not_in')
      matches = (node.values ?? []).some((v) => same(value, v)) === (node.op === 'in')
    else if (node.value) {
      const other = node.value
      switch (node.op) {
        case 'eq':
          matches = same(value, other)
          break
        case 'ne':
          matches = !same(value, other)
          break
        case 'lt':
          matches = value.value < other.value
          break
        case 'le':
          matches = value.value <= other.value
          break
        case 'gt':
          matches = value.value > other.value
          break
        case 'ge':
          matches = value.value >= other.value
          break
        case 'contains':
          matches = String(value.value).includes(String(other.value))
          break
        case 'not_contains':
          matches = !String(value.value).includes(String(other.value))
          break
      }
    }
  }
  const decision = matches ? 'match' : 'no_match'
  return { decision, explanations: [{ path, outcome: decision }] }
}

/** Quantified contexts never mix facts from different namespaces. */
export function evaluateCondition(
  condition: InventoryCondition | null,
  contexts: (Omit<Inventory, 'collectionScope'> & { collectionScope: CollectionScope })[],
  complete = true,
): ReturnType<typeof evaluate> {
  if (!condition) return { decision: 'match', explanations: [] }
  const selected = contexts.filter((c) => {
    const scope = c.collectionScope
    if (condition.selector.kind === 'device') return scope.kind === 'device'
    if (condition.selector.kind === 'exact')
      return JSON.stringify(scope) === JSON.stringify(condition.selector.scope)
    if (condition.selector.kind === 'all_authorized') return true
    const owner = 'owner' in scope ? scope.owner : undefined
    return condition.selector.platform === 'macos' && 'uid' in scope
      ? String(scope.uid) === condition.selector.identity
      : !!owner &&
          owner.kind === condition.selector.platform &&
          (owner.kind === 'windows' ? owner.sid : String(owner.uid)) === condition.selector.identity
  })
  const evaluated = selected.map((c) =>
      evaluate(condition.criteria, { ...c, collectionScope: { kind: 'device' } }),
    ),
    values = evaluated.map((e) => e.decision)
  const decision =
    condition.quantifier === 'one'
      ? selected.length === 1
        ? values[0]!
        : 'unknown'
      : condition.quantifier === 'any'
        ? values.includes('match')
          ? 'match'
          : !complete || !values.length || values.includes('unknown')
            ? 'unknown'
            : 'no_match'
        : values.includes('no_match')
          ? 'no_match'
          : !complete || !values.length || values.includes('unknown')
            ? 'unknown'
            : 'match'
  return { decision, explanations: evaluated.flatMap((e) => e.explanations) }
}
