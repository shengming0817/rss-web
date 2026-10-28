import { formatFilter, parseFilter, type Filter } from '@rss/api/mdm-filter'
import {
  inventoryCondition,
  queryInput,
  type Criteria,
  type FieldDefinition,
  type InventoryCondition,
  type Operator,
  type QueryInput,
  type Scalar,
} from './asset-model'

const operators: Record<Operator, string> = {
  eq: '==',
  ne: '!=',
  lt: '=lt=',
  le: '=le=',
  gt: '=gt=',
  ge: '=ge=',
  in: '=in=',
  not_in: '=out=',
  contains: '=contains=',
  not_contains: '=notcontains=',
  contains_any: '=containsany=',
  contains_all: '=containsall=',
  is_null: '=isnull=',
  is_not_null: '=isnotnull=',
}

function expression(criteria: Criteria): Filter {
  if (criteria.kind !== 'predicate')
    return { kind: criteria.kind, children: criteria.children.map(expression) }
  const values =
    criteria.op === 'is_null' || criteria.op === 'is_not_null'
      ? ['true']
      : (criteria.values ?? (criteria.value ? [criteria.value] : [])).map((value) =>
          String(value.value),
        )
  return { kind: 'compare', field: criteria.field, operator: operators[criteria.op], values }
}

export function encodeAssetQuery(
  condition: InventoryCondition | null,
  fields: string[],
  sort: QueryInput['sort'],
): QueryInput {
  const scope = condition
    ? { selector: condition.selector, quantifier: condition.quantifier }
    : { selector: { kind: 'device' as const }, quantifier: 'one' as const }
  const checked = condition === null ? null : inventoryCondition(condition)
  const empty = checked?.criteria.kind === 'and' && checked.criteria.children.length === 0
  return queryInput({
    filter: checked && !empty ? formatFilter(expression(checked.criteria)) : null,
    scope,
    fields,
    sort,
  })
}

/** Restore editor values using the current field catalog; the server remains the type/authority owner. */
export function decodeAssetCondition(
  input: QueryInput,
  catalog: FieldDefinition[],
): InventoryCondition | null {
  if (input.filter === null) return null
  function operand(field: string, op: Operator, text: string): Scalar {
    const definition = catalog
      .filter((candidate) => field === candidate.key || field.startsWith(candidate.key + '.'))
      .sort((a, b) => b.key.length - a.key.length)[0]
    if (!definition) throw new Error('Unknown field')
    let type = definition.valueType
    const path = field.slice(definition.key.length).split('.').filter(Boolean)
    for (const key of path) {
      if (type.kind === 'array') type = type.items
      if (type.kind === 'record') {
        const next = type.properties[key]
        if (!next) throw new Error('Unknown field path')
        type = next.valueType
      } else if (type.kind === 'object') {
        const next = type.properties[key]
        if (!next) throw new Error('Unknown field path')
        type = next
      } else throw new Error('Unknown field path')
    }
    if (
      type.kind === 'array' &&
      ['contains', 'not_contains', 'contains_any', 'contains_all'].includes(op)
    )
      type = type.items
    if (type.kind === 'enum' || type.kind === 'string') return { kind: 'string', value: text }
    if (type.kind === 'boolean') {
      if (text !== 'true' && text !== 'false') throw new Error('Invalid boolean')
      return { kind: 'boolean', value: text === 'true' }
    }
    if (type.kind === 'integer' || type.kind === 'time' || type.kind === 'number') {
      const value = Number(text)
      if (
        !text ||
        !Number.isFinite(value) ||
        (type.kind !== 'number' && !Number.isSafeInteger(value))
      )
        throw new Error('Invalid numeric operand')
      return { kind: type.kind, value }
    }
    throw new Error('Unsupported operand')
  }
  function criteria(node: Filter): Criteria {
    if (node.kind !== 'compare') return { kind: node.kind, children: node.children.map(criteria) }
    const op = (Object.keys(operators) as Operator[]).find((op) => operators[op] === node.operator)
    if (!op) throw new Error('Unsupported operator')
    const base = { kind: 'predicate' as const, field: node.field, op }
    if (op === 'is_null' || op === 'is_not_null') {
      if (node.values.length !== 1 || node.values[0] !== 'true')
        throw new Error('Invalid null operand')
      return base
    }
    if (['in', 'not_in', 'contains_any', 'contains_all'].includes(op))
      return { ...base, values: node.values.map((value) => operand(node.field, op, value)) }
    if (node.values.length !== 1) throw new Error('Invalid operands')
    return { ...base, value: operand(node.field, op, node.values[0]!) }
  }
  return { ...input.scope, criteria: criteria(parseFilter(input.filter)) }
}
