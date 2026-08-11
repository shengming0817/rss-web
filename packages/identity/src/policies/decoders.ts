import { decodeCursorPage } from '@rss/api'
import { parsePolicyId } from './policy-id'
import { isValidPolicyVersion } from './policy-version'
import type { PolicyVersion } from './policy-version'
import type {
  PoliciesListResponse,
  PolicyAttributeOperand,
  PolicyCreateResponse,
  PolicyDeactivateResponse,
  PolicyGetResponse,
  PolicyLiteralOperand,
  PolicyNumericOperand,
  PolicyObligations,
  PolicyOperator,
  PolicyPatternOperand,
  PolicyRuleView,
  PolicySetOperand,
  PolicyUpdateResponse,
  PolicyView,
  PolicyWriteFields,
} from './types'
import {
  POLICY_ATTRIBUTES,
  POLICY_EQUALITY_PREDICATES,
  POLICY_MEMBERSHIP_PREDICATES,
  POLICY_ORDERING_PREDICATES,
  POLICY_ROW_SCOPES,
  POLICY_STRING_PREDICATES,
} from './types'

const encoder = new TextEncoder()
const DECIMAL = /^(?:0|-?[1-9][0-9]*|(?:-?0|-?[1-9][0-9]*)\.[0-9]*[1-9])$/

function isOneOf<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
): value is Values[number] {
  return typeof value === 'string' && values.some((candidate) => candidate === value)
}

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

function integer(value: unknown, minimum?: number, maximum?: number): number {
  if (
    !Number.isSafeInteger(value) ||
    (minimum !== undefined && (value as number) < minimum) ||
    (maximum !== undefined && (value as number) > maximum)
  )
    invalid('policy')
  return value as number
}

function decimal(value: unknown): string {
  const result = text(value)
  if (result.length > 64 || !DECIMAL.test(result)) invalid('policy')
  return result
}

function literal(value: unknown, numericOnly: true): PolicyNumericOperand
function literal(value: unknown, numericOnly?: false): PolicyLiteralOperand
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
    !isOneOf(input.attribute, POLICY_ATTRIBUTES)
  ) {
    invalid('policy')
  }
  return Object.freeze({
    kind: 'attribute',
    valueType: 'string',
    attribute: input.attribute,
  })
}

function setOperand(value: unknown): PolicySetOperand {
  const input = record(value, ['kind', 'valueType', 'values'])
  if (input.kind !== 'set' || !Array.isArray(input.values)) invalid('policy')
  if (input.values.length < 1 || input.values.length > 32) invalid('policy')
  switch (input.valueType) {
    case 'string': {
      const values = input.values.map((item) => text(item, 256))
      if (new Set(values).size !== values.length) invalid('policy')
      return Object.freeze({ kind: 'set', valueType: 'string', values: Object.freeze(values) })
    }
    case 'boolean':
      if (!input.values.every((item): item is boolean => typeof item === 'boolean'))
        invalid('policy')
      if (new Set(input.values).size !== input.values.length) invalid('policy')
      return Object.freeze({
        kind: 'set',
        valueType: 'boolean',
        values: Object.freeze([...input.values]),
      })
    case 'integer': {
      const values = input.values.map((item) => integer(item))
      if (new Set(values).size !== values.length) invalid('policy')
      return Object.freeze({ kind: 'set', valueType: 'integer', values: Object.freeze(values) })
    }
    case 'decimal': {
      const values = input.values.map(decimal)
      if (new Set(values).size !== values.length) invalid('policy')
      return Object.freeze({ kind: 'set', valueType: 'decimal', values: Object.freeze(values) })
    }
    default:
      return invalid('policy')
  }
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
  if (input.family === 'equality' && isOneOf(input.predicate, POLICY_EQUALITY_PREDICATES)) {
    const candidate = record(input.operand, ['kind'], ['valueType', 'value', 'attribute'])
    const operand =
      candidate.kind === 'attribute' ? attribute(input.operand) : literal(input.operand)
    return Object.freeze({ family: 'equality', predicate: input.predicate, operand })
  }
  if (input.family === 'ordering' && isOneOf(input.predicate, POLICY_ORDERING_PREDICATES)) {
    return Object.freeze({
      family: 'ordering',
      predicate: input.predicate,
      operand: literal(input.operand, true),
    })
  }
  if (input.family === 'membership' && isOneOf(input.predicate, POLICY_MEMBERSHIP_PREDICATES)) {
    return Object.freeze({
      family: 'membership',
      predicate: input.predicate,
      operand: setOperand(input.operand),
    })
  }
  if (input.family === 'string' && isOneOf(input.predicate, POLICY_STRING_PREDICATES)) {
    return Object.freeze({
      family: 'string',
      predicate: input.predicate,
      operand: pattern(input.operand),
    })
  }
  return invalid('policy')
}

function obligations(value: unknown): PolicyObligations {
  const input = record(value, [], ['rowScope', 'fieldMask'])
  if (input.rowScope !== undefined && !isOneOf(input.rowScope, POLICY_ROW_SCOPES)) {
    invalid('policy')
  }
  const mask = input.fieldMask ?? []
  if (!Array.isArray(mask)) invalid('policy')
  const fieldMask = Object.freeze(mask.map((item) => text(item)))
  if (input.rowScope === undefined) return Object.freeze({ fieldMask })
  return Object.freeze({
    rowScope: input.rowScope,
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

export function decodePolicyWriteFields(
  value: unknown,
  options: Readonly<{ requireRules?: boolean }> = {},
): PolicyWriteFields {
  const input = record(
    value,
    ['contractId', 'permission', 'effectiveFrom', 'rules'],
    ['effectiveUntil'],
  )
  if (!Array.isArray(input.rules) || (options.requireRules === true && input.rules.length === 0))
    invalid('policy')
  return Object.freeze({
    contractId: text(input.contractId),
    permission: text(input.permission),
    effectiveFrom: integer(input.effectiveFrom),
    ...(input.effectiveUntil === undefined
      ? {}
      : { effectiveUntil: integer(input.effectiveUntil) }),
    rules: Object.freeze(input.rules.map(rule)),
  })
}

export function decodePolicyView(value: unknown): PolicyView {
  const input = record(
    value,
    ['policyId', 'version', 'contractId', 'permission', 'effectiveFrom', 'rules'],
    ['effectiveUntil'],
  )
  const policyId = parsePolicyId(input.policyId)
  if (policyId === undefined) invalid('policy')
  const fields = decodePolicyWriteFields({
    contractId: input.contractId,
    permission: input.permission,
    effectiveFrom: input.effectiveFrom,
    ...(input.effectiveUntil === undefined ? {} : { effectiveUntil: input.effectiveUntil }),
    rules: input.rules,
  })
  if (!isValidPolicyVersion(input.version)) invalid('policy')
  return Object.freeze({
    policyId,
    version: input.version as PolicyVersion,
    ...fields,
  })
}

const decodePage = decodeCursorPage(decodePolicyView)

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
  return Object.freeze({ data: decodePolicyView(envelope.data) })
}

export function decodePolicyCreateResponse(value: unknown): PolicyCreateResponse {
  return decodePolicyGetResponse(value)
}

export function decodePolicyUpdateResponse(value: unknown): PolicyUpdateResponse {
  return decodePolicyGetResponse(value)
}

export function decodePolicyDeactivateResponse(value: unknown): PolicyDeactivateResponse {
  const envelope = record(value, ['data'])
  const data = record(envelope.data, ['deactivated', 'version'])
  if (typeof data.deactivated !== 'boolean') invalid('policy')
  if (!isValidPolicyVersion(data.version)) invalid('policy')
  return Object.freeze({
    data: Object.freeze({
      deactivated: data.deactivated,
      version: data.version as PolicyVersion,
    }),
  })
}
