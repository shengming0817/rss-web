import type { DeviceRef, Scalar } from '@rss/mdm-devices'
import type {
  ConditionContext,
  Criteria,
  DisplayGroup,
  FieldDefinition,
  Operation,
  QueryDefinition,
  ValueType,
} from './model'

export function uuid(value: string): string {
  if (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)
  )
    throw new Error('Invalid identifier')
  return value
}
export function identifier(value: string, maximum = 1024): string {
  if (!value || /\p{Cc}/u.test(value) || new TextEncoder().encode(value).length > maximum)
    throw new Error('Invalid identifier')
  return value
}
export function revision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER)
    throw new Error('Invalid revision')
  return value
}
export function fieldKey(value: string): string {
  if (value.length > 128 || !/^(device|custom|channel)(\.[a-z][a-z0-9_]*)+$/.test(value))
    throw new Error('Invalid field')
  return value
}
export function reference(value: DeviceRef): void {
  if (value.kind === 'association') uuid(value.id)
  else if (value.kind === 'endpoint') identifier(value.id)
  else throw new Error('Invalid asset reference')
}
/** Freeze the exact authored intent before any HTTP write; recovery never mutates its input. */
export function freeze<T>(value: T): T {
  const copy = structuredClone(value)
  function visit(node: unknown): void {
    if (!node || typeof node !== 'object') return
    for (const child of Object.values(node)) visit(child)
    Object.freeze(node)
  }
  visit(copy)
  return copy
}
export function operation<T>(value: Operation<T>): void {
  uuid(value.operationId)
  revision(value.expectedRevision)
}
export function validateScalar(value: Scalar, depth = 0): void {
  if (depth > 5) throw new Error('Value nesting exceeds budget')
  if (value.kind === 'integer' || value.kind === 'time') {
    if (!Number.isSafeInteger(value.value)) throw new Error('Value exceeds safe integer range')
  } else if (value.kind === 'number') {
    if (!Number.isFinite(value.value)) throw new Error('Invalid number')
  } else if (value.kind === 'string') {
    if (value.value.includes('\0')) throw new Error('Invalid value text')
  } else if (value.kind === 'array') {
    for (const item of value.value) validateScalar(item, depth + 1)
  } else if (value.kind === 'object') {
    for (const [key, item] of Object.entries(value.value)) {
      identifier(key)
      validateScalar(item, depth + 1)
    }
  }
}
export function validateContext(context: ConditionContext): void {
  const selector = context.selector
  if ((selector.kind === 'device' || selector.kind === 'exact') !== (context.quantifier === 'one'))
    throw new Error('Invalid condition quantifier')
  if (selector.kind === 'local_user') {
    if (selector.platform === 'windows') {
      if (!/^S-1-(?:\d+-)*\d+$/.test(selector.identity)) throw new Error('Invalid local SID')
    } else if (!/^[1-9]\d*$/.test(selector.identity) || Number(selector.identity) > 4294967295)
      throw new Error('Invalid local UID')
  }
}
/** Structural authoring bounds only. Field semantics and truth evaluation belong to the server. */
export function validateCriteria(criteria: Criteria): void {
  let nodes = 0
  function visit(node: Criteria, depth: number) {
    if (depth > 16 || ++nodes > 4096) throw new Error('Condition exceeds authoring budget')
    if (node.kind === 'predicate') {
      fieldKey(node.field)
      if (node.value !== undefined) validateScalar(node.value)
      if (node.values !== undefined) node.values.forEach((value) => validateScalar(value))
    } else node.children.forEach((child) => visit(child, depth + 1))
  }
  visit(criteria, 0)
}
export function validateQuery(query: QueryDefinition): void {
  validateContext(query.scope)
  if (
    query.filter !== null &&
    (query.filter.includes('\0') || new TextEncoder().encode(query.filter).length > 8192)
  )
    throw new Error('Query exceeds authoring budget')
  if (!query.filter && (query.scope.selector.kind !== 'device' || query.scope.quantifier !== 'one'))
    throw new Error('Scoped query requires a filter')
  if (
    query.fields.length > 1024 ||
    new Set(query.fields).size !== query.fields.length ||
    query.sort.length > 16
  )
    throw new Error('Query projection exceeds budget')
  query.fields.forEach(fieldKey)
  query.sort.forEach((sort) => fieldKey(sort.field))
  if (new Set(query.sort.map((sort) => sort.field)).size !== query.sort.length)
    throw new Error('Repeated sort field')
}
export function validateValueType(value: ValueType, depth = 0): void {
  if (depth > 5) throw new Error('Field type nesting exceeds budget')
  if (value.kind === 'string') {
    if (!Number.isSafeInteger(value.maxLength) || value.maxLength < 1)
      throw new Error('Invalid string budget')
  } else if (value.kind === 'array') {
    if (!Number.isSafeInteger(value.maxItems) || value.maxItems < 1)
      throw new Error('Invalid list budget')
    validateValueType(value.items, depth + 1)
  } else if (value.kind === 'enum') {
    if (!value.values.length || new Set(value.values).size !== value.values.length)
      throw new Error('Invalid enum values')
  } else if (value.kind === 'object' || value.kind === 'record') {
    for (const [key, property] of Object.entries(value.properties)) {
      identifier(key, 256)
      validateValueType('required' in property ? property.valueType : property, depth + 1)
    }
  }
}
export function validateField(definition: FieldDefinition, expectedRevision: number): void {
  fieldKey(definition.key)
  if (
    !definition.key.startsWith('custom.') ||
    definition.version !== revision(expectedRevision) + 1
  )
    throw new Error('Invalid field write version')
  validateValueType(definition.valueType)
  for (const priority of Object.values(definition.sources)) revision(priority)
}
export function validateLayout(groups: readonly DisplayGroup[]): void {
  if (
    new Set(groups.map((group) => group.id)).size !== groups.length ||
    new TextEncoder().encode(JSON.stringify(groups)).length > 16384
  )
    throw new Error('Layout exceeds budget')
  for (const group of groups) {
    uuid(group.id)
    if (
      !group.name.trim() ||
      [...group.name.trim()].length > 40 ||
      !group.fields.length ||
      new Set(group.fields).size !== group.fields.length
    )
      throw new Error('Invalid display group')
    for (const field of group.fields)
      if (!fieldKey(field).startsWith('custom.'))
        throw new Error('Only custom fields can be placed in this layout')
  }
}
