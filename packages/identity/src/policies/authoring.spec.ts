import { describe, expect, it } from 'vitest'
import {
  createPolicyDeactivateRequest,
  createPolicyUpdateRequest,
  parsePolicyCreateRequest,
} from './authoring'
import { decodePolicyView } from './decoders'

const rule = (operand: object = { kind: 'literal', valueType: 'string', value: 'admin' }) => ({
  condition: {
    attribute: 'resource.dynamic-risk',
    operator: { family: 'equality', predicate: 'eq', operand },
  },
  effect: 'allow',
})

const create = (overrides: Record<string, unknown> = {}) => ({
  policyId: 'policy-write',
  contractId: 'identity.policies-list',
  permission: 'identity:policy:read',
  effectiveFrom: 1_700_000_000,
  rules: [rule()],
  ...overrides,
})

describe('Policy authoring boundary', () => {
  it('preserves an exact create draft without restricting the schema-open LHS attribute', () => {
    expect(parsePolicyCreateRequest(create())).toMatchObject({
      policyId: 'policy-write',
      rules: [{ condition: { attribute: 'resource.dynamic-risk' } }],
    })
  })

  it('uses UTF-8 bytes for bounded values', () => {
    expect(() =>
      parsePolicyCreateRequest(
        create({ rules: [rule({ kind: 'literal', valueType: 'string', value: '界'.repeat(85) })] }),
      ),
    ).not.toThrow()
    expect(() =>
      parsePolicyCreateRequest(
        create({ rules: [rule({ kind: 'literal', valueType: 'string', value: '界'.repeat(86) })] }),
      ),
    ).toThrow('invalid policy')
  })

  it.each(['+1', '-0', '01', '1.0', '1e2', ''])('rejects non-canonical decimal %s', (value) => {
    expect(() =>
      parsePolicyCreateRequest(
        create({ rules: [rule({ kind: 'literal', valueType: 'decimal', value })] }),
      ),
    ).toThrow('invalid policy')
  })

  it.each([
    ['empty rules', { rules: [] }],
    [
      'unknown RHS attribute',
      { rules: [rule({ kind: 'attribute', valueType: 'string', attribute: 'resource.dynamic' })] },
    ],
    [
      'duplicate set',
      {
        rules: [
          {
            condition: {
              attribute: 'x',
              operator: {
                family: 'membership',
                predicate: 'in',
                operand: { kind: 'set', valueType: 'integer', values: [1, 1] },
              },
            },
            effect: 'allow',
          },
        ],
      },
    ],
    ['unsafe int64', { effectiveFrom: Number.MAX_SAFE_INTEGER + 1 }],
    ['extra field', { legacy: true }],
  ])('fails closed for %s', (_name, overrides) => {
    expect(() => parsePolicyCreateRequest(create(overrides))).toThrow()
  })

  it('requires a positive int32 expectedVersion owned by the detail snapshot', () => {
    const snapshot = decodePolicyView(create({ version: 2 }))
    const writeFields = {
      contractId: snapshot.contractId,
      permission: snapshot.permission,
      effectiveFrom: snapshot.effectiveFrom,
      rules: snapshot.rules,
    }
    expect(createPolicyUpdateRequest(snapshot, writeFields)).toMatchObject({
      expectedVersion: 2,
    })
    expect(createPolicyDeactivateRequest(snapshot)).toEqual({ expectedVersion: 2 })
  })
})
