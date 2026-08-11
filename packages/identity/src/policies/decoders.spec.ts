import { describe, expect, it } from 'vitest'
import { decodePoliciesListResponse, decodePolicyGetResponse } from './decoders'
import {
  POLICY_ATTRIBUTES,
  POLICY_EQUALITY_PREDICATES,
  POLICY_MEMBERSHIP_PREDICATES,
  POLICY_ORDERING_PREDICATES,
  POLICY_ROW_SCOPES,
  POLICY_STRING_PREDICATES,
} from './types'

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

  const operatorCases: readonly (readonly [string, object])[] = [
    ...POLICY_ATTRIBUTES.map(
      (attribute) =>
        [
          `attribute ${attribute}`,
          {
            family: 'equality',
            predicate: 'eq',
            operand: { kind: 'attribute', valueType: 'string', attribute },
          },
        ] as const,
    ),
    ...POLICY_EQUALITY_PREDICATES.flatMap((predicate) => [
      [
        `equality ${predicate} string`,
        {
          family: 'equality',
          predicate,
          operand: { kind: 'literal', valueType: 'string', value: 'x' },
        },
      ] as const,
      [
        `equality ${predicate} boolean`,
        {
          family: 'equality',
          predicate,
          operand: { kind: 'literal', valueType: 'boolean', value: true },
        },
      ] as const,
      [
        `equality ${predicate} integer`,
        {
          family: 'equality',
          predicate,
          operand: { kind: 'literal', valueType: 'integer', value: 7 },
        },
      ] as const,
      [
        `equality ${predicate} decimal`,
        {
          family: 'equality',
          predicate,
          operand: { kind: 'literal', valueType: 'decimal', value: '7.5' },
        },
      ] as const,
    ]),
    ...POLICY_ORDERING_PREDICATES.map(
      (predicate, index) =>
        [
          `ordering ${predicate}`,
          {
            family: 'ordering',
            predicate,
            operand:
              index % 2 === 0
                ? { kind: 'literal', valueType: 'integer', value: 7 }
                : { kind: 'literal', valueType: 'decimal', value: '7.5' },
          },
        ] as const,
    ),
    ...POLICY_MEMBERSHIP_PREDICATES.flatMap((predicate) => [
      [
        `membership ${predicate} string`,
        {
          family: 'membership',
          predicate,
          operand: { kind: 'set', valueType: 'string', values: ['a', 'b'] },
        },
      ] as const,
      [
        `membership ${predicate} boolean`,
        {
          family: 'membership',
          predicate,
          operand: { kind: 'set', valueType: 'boolean', values: [true, false] },
        },
      ] as const,
      [
        `membership ${predicate} integer`,
        {
          family: 'membership',
          predicate,
          operand: { kind: 'set', valueType: 'integer', values: [1, 2] },
        },
      ] as const,
      [
        `membership ${predicate} decimal`,
        {
          family: 'membership',
          predicate,
          operand: { kind: 'set', valueType: 'decimal', values: ['1.5', '2.5'] },
        },
      ] as const,
    ]),
    ...POLICY_STRING_PREDICATES.map(
      (predicate) =>
        [
          `string ${predicate}`,
          {
            family: 'string',
            predicate,
            operand: { kind: 'pattern', valueType: 'string', value: 'rss-*' },
          },
        ] as const,
    ),
  ]

  it.each(operatorCases)('accepts active %s operator shape', (_name, operator) => {
    const decoded = decodePolicyGetResponse({
      data: {
        ...policy,
        rules: [{ condition: { attribute: 'resource.value', operator }, effect: 'allow' }],
      },
    })
    expect(decoded.data.rules[0]?.condition.operator).toEqual(operator)
  })

  it.each(POLICY_ROW_SCOPES)('accepts active %s row scope', (rowScope) => {
    const decoded = decodePolicyGetResponse({
      data: {
        ...policy,
        rules: [
          {
            condition: { attribute: 'x', operator: rules[0]!.condition.operator },
            effect: 'allow',
            obligations: { rowScope, fieldMask: [] },
          },
        ],
      },
    })
    expect(decoded.data.rules[0]?.obligations?.rowScope).toBe(rowScope)
  })

  it('enforces the positive int32 version boundary', () => {
    expect(
      decodePolicyGetResponse({ data: { ...policy, version: 2_147_483_647 } }).data.version,
    ).toBe(2_147_483_647)
    expect(() => decodePolicyGetResponse({ data: { ...policy, version: 2_147_483_648 } })).toThrow(
      'invalid policy',
    )
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
