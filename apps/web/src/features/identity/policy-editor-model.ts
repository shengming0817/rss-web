import {
  POLICY_ATTRIBUTES,
  POLICY_ORDERING_PREDICATES,
  POLICY_STRING_PREDICATES,
  type PolicyLiteralOperand,
  type PolicyOperator,
  type PolicyRuleView,
  type PolicySetOperand,
  type PolicyView,
  type PolicyWriteFields,
} from '@rss/identity'

export type EditableValueType = 'string' | 'boolean' | 'integer' | 'decimal'
export interface EditablePolicyRule {
  attribute: string
  family: PolicyOperator['family']
  predicate: string
  operandKind: 'literal' | 'attribute' | 'set' | 'pattern'
  valueType: EditableValueType
  value: string
  values: string[]
  effect: 'allow' | 'deny'
  rowScope: '' | 'selfOnly' | 'device' | 'tenant'
  fieldMask: string[]
}

export interface EditablePolicyDraft {
  policyId: string
  contractId: string
  permission: string
  effectiveFrom: string
  effectiveUntil: string
  rules: EditablePolicyRule[]
}

export class PolicyEditorValidationError extends Error {
  constructor(readonly path: string) {
    super('invalid policy editor value')
  }
}

const encoder = new TextEncoder()
const DECIMAL = /^(?:0|-?[1-9][0-9]*|(?:-?0|-?[1-9][0-9]*)\.[0-9]*[1-9])$/

function invalid(path: string): never {
  throw new PolicyEditorValidationError(path)
}

function includes<const T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value)
}

export function emptyPolicyRule(): EditablePolicyRule {
  return {
    attribute: '',
    family: 'equality',
    predicate: 'eq',
    operandKind: 'literal',
    valueType: 'string',
    value: '',
    values: [''],
    effect: 'allow',
    rowScope: '',
    fieldMask: [],
  }
}

function editableRule(rule: PolicyRuleView): EditablePolicyRule {
  const operator = rule.condition.operator
  const operand = operator.operand
  return {
    attribute: rule.condition.attribute,
    family: operator.family,
    predicate: operator.predicate,
    operandKind: operand.kind,
    valueType: operand.valueType,
    value:
      operand.kind === 'attribute'
        ? operand.attribute
        : operand.kind === 'set'
          ? ''
          : String(operand.value),
    values: operand.kind === 'set' ? operand.values.map(String) : [''],
    effect: rule.effect,
    rowScope: rule.obligations?.rowScope ?? '',
    fieldMask: [...(rule.obligations?.fieldMask ?? [])],
  }
}

export function policyEditorDraft(snapshot?: PolicyView): EditablePolicyDraft {
  if (snapshot === undefined) {
    return {
      policyId: '',
      contractId: '',
      permission: '',
      effectiveFrom: '',
      effectiveUntil: '',
      rules: [emptyPolicyRule()],
    }
  }
  return {
    policyId: snapshot.policyId,
    contractId: snapshot.contractId,
    permission: snapshot.permission,
    effectiveFrom: String(snapshot.effectiveFrom),
    effectiveUntil: snapshot.effectiveUntil === undefined ? '' : String(snapshot.effectiveUntil),
    rules: snapshot.rules.map(editableRule),
  }
}

function scalar(value: string, type: 'string' | 'decimal', path: string): string
function scalar(value: string, type: 'boolean', path: string): boolean
function scalar(value: string, type: 'integer', path: string): number
function scalar(value: string, type: EditableValueType, path: string): string | boolean | number {
  if (type === 'boolean') {
    if (value !== 'true' && value !== 'false') invalid(path)
    return value === 'true'
  }
  if (type === 'integer') {
    const parsed = Number(value)
    if (!/^-?(?:0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(parsed)) {
      invalid(path)
    }
    return parsed
  }
  if (type === 'decimal' && (value.length > 64 || !DECIMAL.test(value))) invalid(path)
  if (type === 'string' && encoder.encode(value).length > 256) invalid(path)
  return value
}

function literal(value: string, type: EditableValueType, path: string): PolicyLiteralOperand {
  switch (type) {
    case 'string':
      return { kind: 'literal', valueType: 'string', value: scalar(value, type, path) }
    case 'boolean':
      return { kind: 'literal', valueType: 'boolean', value: scalar(value, type, path) }
    case 'integer':
      return { kind: 'literal', valueType: 'integer', value: scalar(value, type, path) }
    case 'decimal':
      return { kind: 'literal', valueType: 'decimal', value: scalar(value, type, path) }
  }
}

function set(values: string[], type: EditableValueType, path: string): PolicySetOperand {
  if (values.length < 1 || values.length > 32) invalid(path)
  const duplicateIndex = values.findIndex((value, index) => values.indexOf(value) !== index)
  if (duplicateIndex !== -1) invalid(`${path}.${duplicateIndex}`)
  switch (type) {
    case 'string':
      return {
        kind: 'set',
        valueType: 'string',
        values: values.map((value, index) => scalar(value, type, `${path}.${index}`)),
      }
    case 'boolean':
      return {
        kind: 'set',
        valueType: 'boolean',
        values: values.map((value, index) => scalar(value, type, `${path}.${index}`)),
      }
    case 'integer':
      return {
        kind: 'set',
        valueType: 'integer',
        values: values.map((value, index) => scalar(value, type, `${path}.${index}`)),
      }
    case 'decimal':
      return {
        kind: 'set',
        valueType: 'decimal',
        values: values.map((value, index) => scalar(value, type, `${path}.${index}`)),
      }
  }
}

function operator(rule: EditablePolicyRule, ruleIndex: number): PolicyOperator {
  const operandPath = `rules.${ruleIndex}.operand`
  if (rule.family === 'equality') {
    if (rule.predicate !== 'eq' && rule.predicate !== 'ne') invalid(`rules.${ruleIndex}.predicate`)
    if (rule.operandKind === 'attribute') {
      if (!includes(POLICY_ATTRIBUTES, rule.value)) {
        invalid(operandPath)
      }
      return {
        family: 'equality',
        predicate: rule.predicate,
        operand: { kind: 'attribute', valueType: 'string', attribute: rule.value },
      }
    }
    return {
      family: 'equality',
      predicate: rule.predicate,
      operand: literal(rule.value, rule.valueType, operandPath),
    }
  }
  if (rule.family === 'ordering') {
    if (!includes(POLICY_ORDERING_PREDICATES, rule.predicate))
      invalid(`rules.${ruleIndex}.predicate`)
    if (rule.valueType !== 'integer' && rule.valueType !== 'decimal')
      invalid(`rules.${ruleIndex}.valueType`)
    return rule.valueType === 'integer'
      ? {
          family: 'ordering',
          predicate: rule.predicate,
          operand: {
            kind: 'literal',
            valueType: 'integer',
            value: scalar(rule.value, 'integer', operandPath),
          },
        }
      : {
          family: 'ordering',
          predicate: rule.predicate,
          operand: {
            kind: 'literal',
            valueType: 'decimal',
            value: scalar(rule.value, 'decimal', operandPath),
          },
        }
  }
  if (rule.family === 'membership') {
    if (rule.predicate !== 'in' && rule.predicate !== 'notIn')
      invalid(`rules.${ruleIndex}.predicate`)
    return {
      family: 'membership',
      predicate: rule.predicate,
      operand: set(rule.values, rule.valueType, `rules.${ruleIndex}.values`),
    }
  }
  if (!includes(POLICY_STRING_PREDICATES, rule.predicate)) {
    invalid(`rules.${ruleIndex}.predicate`)
  }
  if (rule.value.length === 0) invalid(operandPath)
  return {
    family: 'string',
    predicate: rule.predicate,
    operand: {
      kind: 'pattern',
      valueType: 'string',
      value: scalar(rule.value, 'string', operandPath),
    },
  }
}

function time(value: string, path: string, optional = false): number | undefined {
  if (optional && value === '') return undefined
  const parsed = Number(value)
  if (!/^(?:0|-?[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(parsed)) {
    invalid(path)
  }
  return parsed
}

export function policyEditorFields(draft: EditablePolicyDraft): PolicyWriteFields {
  if (draft.contractId.length === 0) invalid('contractId')
  if (draft.permission.length === 0) invalid('permission')
  if (draft.rules.length === 0) invalid('rules')
  const effectiveUntil = time(draft.effectiveUntil, 'effectiveUntil', true)
  return Object.freeze({
    contractId: draft.contractId,
    permission: draft.permission,
    effectiveFrom: time(draft.effectiveFrom, 'effectiveFrom')!,
    ...(effectiveUntil === undefined ? {} : { effectiveUntil }),
    rules: Object.freeze(
      draft.rules.map((rule, ruleIndex): PolicyRuleView => {
        return Object.freeze({
          condition: Object.freeze({
            attribute: rule.attribute,
            operator: operator(rule, ruleIndex),
          }),
          effect: rule.effect,
          ...(rule.rowScope === '' && rule.fieldMask.length === 0
            ? {}
            : {
                obligations: Object.freeze({
                  ...(rule.rowScope === '' ? {} : { rowScope: rule.rowScope }),
                  fieldMask: Object.freeze([...rule.fieldMask]),
                }),
              }),
        })
      }),
    ),
  })
}
