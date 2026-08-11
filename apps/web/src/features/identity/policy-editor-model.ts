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

function scalar(value: string, type: 'string' | 'decimal'): string
function scalar(value: string, type: 'boolean'): boolean
function scalar(value: string, type: 'integer'): number
function scalar(value: string, type: EditableValueType): string | boolean | number {
  if (type === 'boolean') {
    if (value !== 'true' && value !== 'false') throw new Error('invalid policy editor value')
    return value === 'true'
  }
  if (type === 'integer') {
    const parsed = Number(value)
    if (!/^-?(?:0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(parsed)) {
      throw new Error('invalid policy editor value')
    }
    return parsed
  }
  return value
}

function literal(value: string, type: EditableValueType): PolicyLiteralOperand {
  switch (type) {
    case 'string':
      return { kind: 'literal', valueType: 'string', value }
    case 'boolean':
      return { kind: 'literal', valueType: 'boolean', value: scalar(value, type) }
    case 'integer':
      return { kind: 'literal', valueType: 'integer', value: scalar(value, type) }
    case 'decimal':
      return { kind: 'literal', valueType: 'decimal', value }
  }
}

function set(values: string[], type: EditableValueType): PolicySetOperand {
  switch (type) {
    case 'string':
      return { kind: 'set', valueType: 'string', values }
    case 'boolean':
      return {
        kind: 'set',
        valueType: 'boolean',
        values: values.map((value) => scalar(value, type)),
      }
    case 'integer':
      return {
        kind: 'set',
        valueType: 'integer',
        values: values.map((value) => scalar(value, type)),
      }
    case 'decimal':
      return { kind: 'set', valueType: 'decimal', values }
  }
}

function operator(rule: EditablePolicyRule): PolicyOperator {
  if (rule.family === 'equality') {
    if (rule.predicate !== 'eq' && rule.predicate !== 'ne')
      throw new Error('invalid policy editor value')
    if (rule.operandKind === 'attribute') {
      if (!includes(POLICY_ATTRIBUTES, rule.value)) {
        throw new Error('invalid policy editor value')
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
      operand: literal(rule.value, rule.valueType),
    }
  }
  if (rule.family === 'ordering') {
    if (!includes(POLICY_ORDERING_PREDICATES, rule.predicate))
      throw new Error('invalid policy editor value')
    if (rule.valueType !== 'integer' && rule.valueType !== 'decimal')
      throw new Error('invalid policy editor value')
    return rule.valueType === 'integer'
      ? {
          family: 'ordering',
          predicate: rule.predicate,
          operand: { kind: 'literal', valueType: 'integer', value: scalar(rule.value, 'integer') },
        }
      : {
          family: 'ordering',
          predicate: rule.predicate,
          operand: { kind: 'literal', valueType: 'decimal', value: rule.value },
        }
  }
  if (rule.family === 'membership') {
    if (rule.predicate !== 'in' && rule.predicate !== 'notIn')
      throw new Error('invalid policy editor value')
    return {
      family: 'membership',
      predicate: rule.predicate,
      operand: set(rule.values, rule.valueType),
    }
  }
  if (!includes(POLICY_STRING_PREDICATES, rule.predicate)) {
    throw new Error('invalid policy editor value')
  }
  return {
    family: 'string',
    predicate: rule.predicate,
    operand: { kind: 'pattern', valueType: 'string', value: rule.value },
  }
}

function time(value: string, optional = false): number | undefined {
  if (optional && value === '') return undefined
  const parsed = Number(value)
  if (!/^(?:0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(parsed)) {
    throw new Error('invalid policy editor value')
  }
  return parsed
}

export function policyEditorFields(draft: EditablePolicyDraft): PolicyWriteFields {
  const effectiveUntil = time(draft.effectiveUntil, true)
  return Object.freeze({
    contractId: draft.contractId,
    permission: draft.permission,
    effectiveFrom: time(draft.effectiveFrom)!,
    ...(effectiveUntil === undefined ? {} : { effectiveUntil }),
    rules: Object.freeze(
      draft.rules.map(
        (rule): PolicyRuleView =>
          Object.freeze({
            condition: Object.freeze({ attribute: rule.attribute, operator: operator(rule) }),
            effect: rule.effect,
            ...(rule.rowScope === '' && rule.fieldMask.length === 0
              ? {}
              : {
                  obligations: Object.freeze({
                    ...(rule.rowScope === '' ? {} : { rowScope: rule.rowScope }),
                    fieldMask: Object.freeze([...rule.fieldMask]),
                  }),
                }),
          }),
      ),
    ),
  })
}
