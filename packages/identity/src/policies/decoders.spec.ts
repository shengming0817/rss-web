import { describe, expect, it } from 'vitest'
import { decodePoliciesListResponse, decodePolicyGetResponse } from './decoders'

const rules = [
  {
    condition: {
      attribute: 'principal.kind',
      operator: {
        family: 'equality',
        predicate: 'eq',
        operand: { kind: 'literal', valueType: 'string', value: 'admin' },
      },
    },
    effect: 'allow',
    obligations: { rowScope: 'tenant', fieldMask: ['subject', 'tenantId'] },
  },
  {
    condition: {
      attribute: 'resource.score',
      operator: {
        family: 'ordering',
        predicate: 'ge',
        operand: { kind: 'literal', valueType: 'decimal', value: '1.5' },
      },
    },
    effect: 'deny',
  },
  {
    condition: {
      attribute: 'resource.state',
      operator: {
        family: 'membership',
        predicate: 'in',
        operand: { kind: 'set', valueType: 'string', values: ['ready', 'blocked'] },
      },
    },
    effect: 'allow',
    obligations: {},
  },
  {
    condition: {
      attribute: 'resource.name',
      operator: {
        family: 'string',
        predicate: 'startsWith',
        operand: { kind: 'pattern', valueType: 'string', value: 'rss-' },
      },
    },
    effect: 'allow',
  },
]

const policy = {
  policyId: 'policy-read',
  version: 2,
  contractId: 'identity.policies-list',
  permission: 'identity:policy:read',
  effectiveFrom: 1_700_000_000,
  effectiveUntil: 1_800_000_000,
  rules,
}

describe('Policies strict decoders', () => {
  it('preserves every current operator family, typed operand, obligation and effective window', () => {
    const page = decodePoliciesListResponse({ data: [policy], hasMore: false })
    const detail = decodePolicyGetResponse({ data: policy })
    expect(page.data[0]).toEqual(detail.data)
    expect(detail.data.rules).toHaveLength(4)
    expect(detail.data.rules[0]?.obligations).toEqual({
      rowScope: 'tenant',
      fieldMask: ['subject', 'tenantId'],
    })
    expect(detail.data.rules[2]?.obligations).toEqual({ fieldMask: [] })
    expect(detail.data.effectiveUntil).toBe(1_800_000_000)
  })

  it.each([
    ['additional policy field', { ...policy, legacy: true }],
    [
      'family/operand mismatch',
      {
        ...policy,
        rules: [
          {
            condition: {
              attribute: 'x',
              operator: {
                family: 'ordering',
                predicate: 'gt',
                operand: { kind: 'attribute', valueType: 'string', attribute: 'principal.id' },
              },
            },
            effect: 'allow',
          },
        ],
      },
    ],
    [
      'duplicate set values',
      {
        ...policy,
        rules: [
          {
            condition: {
              attribute: 'x',
              operator: {
                family: 'membership',
                predicate: 'in',
                operand: { kind: 'set', valueType: 'string', values: ['x', 'x'] },
              },
            },
            effect: 'allow',
          },
        ],
      },
    ],
    ['unsafe int64', { ...policy, effectiveFrom: Number.MAX_SAFE_INTEGER + 1 }],
    [
      'non canonical decimal',
      {
        ...policy,
        rules: [
          {
            condition: {
              attribute: 'x',
              operator: {
                family: 'ordering',
                predicate: 'gt',
                operand: { kind: 'literal', valueType: 'decimal', value: '1.0' },
              },
            },
            effect: 'allow',
          },
        ],
      },
    ],
  ])('fails closed for %s', (_name, invalid) => {
    expect(() => decodePolicyGetResponse({ data: invalid })).toThrow('invalid policy')
  })

  it('rejects cursor envelope drift', () => {
    expect(() =>
      decodePoliciesListResponse({ data: [policy], hasMore: false, nextCursor: 'stale' }),
    ).not.toThrow()
    expect(() =>
      decodePoliciesListResponse({ data: [policy], hasMore: false, extra: true }),
    ).toThrow('invalid policies list')
  })
})
