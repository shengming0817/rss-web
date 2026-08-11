import { describe, expect, it } from 'vitest'
import { parsePolicyCreateRequest } from '@rss/identity'
import {
  emptyPolicyRule,
  policyEditorFields,
  type EditablePolicyDraft,
  type EditablePolicyRule,
} from './policy-editor-model'

function draft(rule = emptyPolicyRule()): EditablePolicyDraft {
  return {
    policyId: 'policy-editor',
    contractId: 'identity.policies-list',
    permission: 'identity:policy:read',
    effectiveFrom: '1700000000',
    effectiveUntil: '',
    rules: [rule],
  }
}

describe('Policy editor model', () => {
  it.each([
    [
      'equality attribute',
      {
        family: 'equality',
        predicate: 'ne',
        operandKind: 'attribute',
        valueType: 'string',
        value: 'principal.id',
      },
    ],
    [
      'ordering decimal',
      {
        family: 'ordering',
        predicate: 'ge',
        operandKind: 'literal',
        valueType: 'decimal',
        value: '1.5',
      },
    ],
    [
      'membership boolean',
      {
        family: 'membership',
        predicate: 'notIn',
        operandKind: 'set',
        valueType: 'boolean',
        values: ['true', 'false'],
      },
    ],
    [
      'string regex',
      {
        family: 'string',
        predicate: 'regex',
        operandKind: 'pattern',
        valueType: 'string',
        value: '^rss-',
      },
    ],
  ] as const)('builds typed %s without evaluating it', (_name, changes) => {
    const editable = {
      ...emptyPolicyRule(),
      ...changes,
      ...('values' in changes ? { values: Array.from(changes.values) } : {}),
    } as EditablePolicyRule
    const fields = policyEditorFields(draft(editable))
    expect(() => parsePolicyCreateRequest({ policyId: 'policy-editor', ...fields })).not.toThrow()
  })

  it('rejects unsafe integers and invalid family combinations before confirmation', () => {
    expect(() =>
      policyEditorFields(
        draft({
          ...emptyPolicyRule(),
          family: 'ordering',
          predicate: 'eq',
          valueType: 'integer',
          value: '9007199254740992',
        }),
      ),
    ).toThrow('invalid policy editor value')
  })

  it.each(['-1', '0', String(Number.MAX_SAFE_INTEGER)])(
    'round-trips signed safe int64 time %s',
    (effectiveFrom) => {
      expect(policyEditorFields({ ...draft(), effectiveFrom }).effectiveFrom).toBe(
        Number(effectiveFrom),
      )
    },
  )

  it.each(['-0', String(Number.MAX_SAFE_INTEGER + 1)])(
    'rejects non-canonical or unsafe time %s',
    (effectiveFrom) => {
      expect(() => policyEditorFields({ ...draft(), effectiveFrom })).toThrow(
        'invalid policy editor value',
      )
    },
  )
})
