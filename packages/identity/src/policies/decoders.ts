import { decodeCursorPage } from '@rss/api'
import { parsePolicyId } from './policy-id'
import type {
  PoliciesListResponse,
  PolicyAttributeOperand,
  PolicyGetResponse,
  PolicyLiteralOperand,
  PolicyNumericOperand,
  PolicyObligations,
  PolicyOperator,
  PolicyPatternOperand,
  PolicyRuleView,
  PolicySetOperand,
  PolicyView,
} from './types'

const encoder = new TextEncoder()
const DECIMAL = /^(?:0|-?[1-9][0-9]*|(?:-?0|-?[1-9][0-9]*)\.[0-9]*[1-9])$/
const ATTRIBUTES = new Set([
  'principal.kind',
  'principal.id',
  'tenant.id',
  'contract.id',
  'permission',
  'resource.id',
])

function invalid(kind: 'policy' | 'policies list'): never {
  throw new Error(`invalid ${kind} response`)
}

function record(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
  kind: 'policy' | 'policies list' = 'policy',
) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(kind)
  const result = value as Record<string, unknown>
  const allowed = new Set([...required, ...optional])
  if (
    Reflect.ownKeys(result).some((key) => typeof key !== 'string' || !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(result, key))
  ) {
    invalid(kind)
  }
  return result
}

function text(value: unknown, maxBytes?: number): string {
  if (
    typeof value !== 'string' ||
    (maxBytes !== undefined && encoder.encode(value).length > maxBytes)
  )
    invalid('policy')
  return value
}

function integer(value: unknown, minimum?: number): number {
  if (!Number.isSafeInteger(value) || (minimum !== undefined && (value as number) < minimum))
    invalid('policy')
  return value as number
}

function decimal(value: unknown): string {
  const result = text(value)
  if (result.length > 64 || !DECIMAL.test(result)) invalid('policy')
  return result
}

function literal(value: unknown, numericOnly = false): PolicyLiteralOperand | PolicyNumericOperand {
  const input = record(value, ['kind', 'valueType', 'value'])
  if (input.kind !== 'literal') invalid('policy')
  switch (input.valueType) {
    case 'string':
      if (numericOnly) invalid('policy')
      return Object.freeze({ kind: 'literal', valueType: 'string', value: text(input.value, 256) })
    case 'boolean':
      if (numericOnly || typeof input.value !== 'boolean') invalid('policy')
      return Object.freeze({ kind: 'literal', valueType: 'boolean', value: input.value })
    case 'integer':
      return Object.freeze({ kind: 'literal', valueType: 'integer', value: integer(input.value) })
    case 'decimal':
      return Object.freeze({ kind: 'literal', valueType: 'decimal', value: decimal(input.value) })
    default:
      return invalid('policy')
  }
}

function attribute(value: unknown): PolicyAttributeOperand {
  const input = record(value, ['kind', 'valueType', 'attribute'])
  if (
    input.kind !== 'attribute' ||
    input.valueType !== 'string' ||
    typeof input.attribute !== 'string' ||
    !ATTRIBUTES.has(input.attribute)
  ) {
    invalid('policy')
  }
  return Object.freeze({
    kind: 'attribute',
    valueType: 'string',
    attribute: input.attribute as PolicyAttributeOperand['attribute'],
  })
}

function setOperand(value: unknown): PolicySetOperand {
  const input = record(value, ['kind', 'valueType', 'values'])
  if (input.kind !== 'set' || !Array.isArray(input.values)) invalid('policy')
  if (input.values.length < 1 || input.values.length > 32) invalid('policy')
  let values: readonly (string | boolean | number)[]
  switch (input.valueType) {
    case 'string':
      values = input.values.map((item) => text(item, 256))
      break
    case 'boolean':
      if (input.values.some((item) => typeof item !== 'boolean')) invalid('policy')
      values = input.values as boolean[]
      break
    case 'integer':
      values = input.values.map((item) => integer(item))
      break
    case 'decimal':
      values = input.values.map(decimal)
      break
    default:
      return invalid('policy')
  }
  if (new Set(values).size !== values.length) invalid('policy')
  return Object.freeze({
    kind: 'set',
    valueType: input.valueType,
    values: Object.freeze([...values]),
  }) as PolicySetOperand
}

function pattern(value: unknown): PolicyPatternOperand {
  const input = record(value, ['kind', 'valueType', 'value'])
  if (input.kind !== 'pattern' || input.valueType !== 'string') invalid('policy')
  const result = text(input.value, 256)
  if (result.length === 0) invalid('policy')
  return Object.freeze({ kind: 'pattern', valueType: 'string', value: result })
}

function operator(value: unknown): PolicyOperator {
  const input = record(value, ['family', 'predicate', 'operand'])
  if (input.family === 'equality' && (input.predicate === 'eq' || input.predicate === 'ne')) {
    const candidate = record(input.operand, ['kind'], ['valueType', 'value', 'attribute'])
    const operand =
      candidate.kind === 'attribute' ? attribute(input.operand) : literal(input.operand)
    return Object.freeze({ family: 'equality', predicate: input.predicate, operand })
  }
  if (input.family === 'ordering' && ['gt', 'ge', 'lt', 'le'].includes(String(input.predicate))) {
    return Object.freeze({
      family: 'ordering',
      predicate: input.predicate as 'gt' | 'ge' | 'lt' | 'le',
      operand: literal(input.operand, true) as PolicyNumericOperand,
    })
  }
  if (input.family === 'membership' && (input.predicate === 'in' || input.predicate === 'notIn')) {
    return Object.freeze({
      family: 'membership',
      predicate: input.predicate,
      operand: setOperand(input.operand),
    })
  }
  if (
    input.family === 'string' &&
    ['startsWith', 'endsWith', 'contains', 'glob', 'regex'].includes(String(input.predicate))
  ) {
    return Object.freeze({
      family: 'string',
      predicate: input.predicate as 'startsWith' | 'endsWith' | 'contains' | 'glob' | 'regex',
      operand: pattern(input.operand),
    })
  }
  return invalid('policy')
}

function obligations(value: unknown): PolicyObligations {
  const input = record(value, [], ['rowScope', 'fieldMask'])
  if (
    input.rowScope !== undefined &&
    !['selfOnly', 'device', 'tenant'].includes(String(input.rowScope))
  ) {
    invalid('policy')
  }
  const mask = input.fieldMask ?? []
  if (!Array.isArray(mask)) invalid('policy')
  const fieldMask = Object.freeze(mask.map((item) => text(item)))
  if (input.rowScope === undefined) return Object.freeze({ fieldMask })
  return Object.freeze({
    rowScope: input.rowScope as NonNullable<PolicyObligations['rowScope']>,
    fieldMask,
  })
}

function rule(value: unknown): PolicyRuleView {
  const input = record(value, ['condition', 'effect'], ['obligations'])
  const condition = record(input.condition, ['attribute', 'operator'])
  if (input.effect !== 'allow' && input.effect !== 'deny') invalid('policy')
  return Object.freeze({
    condition: Object.freeze({
      attribute: text(condition.attribute),
      operator: operator(condition.operator),
    }),
    effect: input.effect,
    ...(input.obligations === undefined ? {} : { obligations: obligations(input.obligations) }),
  })
}

function policy(value: unknown): PolicyView {
  const input = record(
    value,
    ['policyId', 'version', 'contractId', 'permission', 'effectiveFrom', 'rules'],
    ['effectiveUntil'],
  )
  const policyId = parsePolicyId(input.policyId)
  if (policyId === undefined || !Array.isArray(input.rules)) invalid('policy')
  return Object.freeze({
    policyId,
    version: integer(input.version, 1),
    contractId: text(input.contractId),
    permission: text(input.permission),
    effectiveFrom: integer(input.effectiveFrom),
    ...(input.effectiveUntil === undefined
      ? {}
      : { effectiveUntil: integer(input.effectiveUntil) }),
    rules: Object.freeze(input.rules.map(rule)),
  })
}

const decodePage = decodeCursorPage(policy)

export function decodePoliciesListResponse(value: unknown): PoliciesListResponse {
  try {
    const page = decodePage(value)
    return Object.freeze({
      data: Object.freeze([...page.data]),
      hasMore: page.hasMore,
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    })
  } catch {
    return invalid('policies list')
  }
}

export function decodePolicyGetResponse(value: unknown): PolicyGetResponse {
  const envelope = record(value, ['data'])
  return Object.freeze({ data: policy(envelope.data) })
}
