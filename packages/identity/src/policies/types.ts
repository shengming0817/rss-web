import type { CursorPage } from '@rss/api'
import type { PolicyId } from './policy-id'

export const POLICY_ATTRIBUTES = Object.freeze([
  'principal.kind',
  'principal.id',
  'tenant.id',
  'contract.id',
  'permission',
  'resource.id',
] as const)
export const POLICY_EQUALITY_PREDICATES = Object.freeze(['eq', 'ne'] as const)
export const POLICY_ORDERING_PREDICATES = Object.freeze(['gt', 'ge', 'lt', 'le'] as const)
export const POLICY_MEMBERSHIP_PREDICATES = Object.freeze(['in', 'notIn'] as const)
export const POLICY_STRING_PREDICATES = Object.freeze([
  'startsWith',
  'endsWith',
  'contains',
  'glob',
  'regex',
] as const)
export const POLICY_ROW_SCOPES = Object.freeze(['selfOnly', 'device', 'tenant'] as const)

export type PolicyAttribute = (typeof POLICY_ATTRIBUTES)[number]
export type PolicyEqualityPredicate = (typeof POLICY_EQUALITY_PREDICATES)[number]
export type PolicyOrderingPredicate = (typeof POLICY_ORDERING_PREDICATES)[number]
export type PolicyMembershipPredicate = (typeof POLICY_MEMBERSHIP_PREDICATES)[number]
export type PolicyStringPredicate = (typeof POLICY_STRING_PREDICATES)[number]
export type PolicyRowScope = (typeof POLICY_ROW_SCOPES)[number]

export type PolicyAttributeOperand = Readonly<{
  kind: 'attribute'
  valueType: 'string'
  attribute: PolicyAttribute
}>

export type PolicyLiteralOperand =
  | Readonly<{ kind: 'literal'; valueType: 'string'; value: string }>
  | Readonly<{ kind: 'literal'; valueType: 'boolean'; value: boolean }>
  | Readonly<{ kind: 'literal'; valueType: 'integer'; value: number }>
  | Readonly<{ kind: 'literal'; valueType: 'decimal'; value: string }>

export type PolicyNumericOperand = Extract<
  PolicyLiteralOperand,
  { valueType: 'integer' | 'decimal' }
>

export type PolicySetOperand =
  | Readonly<{ kind: 'set'; valueType: 'string'; values: readonly string[] }>
  | Readonly<{ kind: 'set'; valueType: 'boolean'; values: readonly boolean[] }>
  | Readonly<{ kind: 'set'; valueType: 'integer'; values: readonly number[] }>
  | Readonly<{ kind: 'set'; valueType: 'decimal'; values: readonly string[] }>

export type PolicyPatternOperand = Readonly<{
  kind: 'pattern'
  valueType: 'string'
  value: string
}>

export type PolicyOperator =
  | Readonly<{
      family: 'equality'
      predicate: PolicyEqualityPredicate
      operand: PolicyLiteralOperand | PolicyAttributeOperand
    }>
  | Readonly<{
      family: 'ordering'
      predicate: PolicyOrderingPredicate
      operand: PolicyNumericOperand
    }>
  | Readonly<{
      family: 'membership'
      predicate: PolicyMembershipPredicate
      operand: PolicySetOperand
    }>
  | Readonly<{
      family: 'string'
      predicate: PolicyStringPredicate
      operand: PolicyPatternOperand
    }>

export interface PolicyObligations {
  readonly rowScope?: PolicyRowScope
  readonly fieldMask: readonly string[]
}

export interface PolicyRuleView {
  readonly condition: Readonly<{ attribute: string; operator: PolicyOperator }>
  readonly effect: 'allow' | 'deny'
  readonly obligations?: PolicyObligations
}

export interface PolicyView {
  readonly policyId: PolicyId
  readonly version: number
  readonly contractId: string
  readonly permission: string
  readonly effectiveFrom: number
  readonly effectiveUntil?: number
  readonly rules: readonly PolicyRuleView[]
}

export type PoliciesListResponse = CursorPage<PolicyView>
export interface PolicyGetResponse {
  readonly data: PolicyView
}
export interface PoliciesListRequest {
  readonly limit?: number
  readonly cursor?: string
}
export interface PoliciesCallOptions {
  readonly signal?: AbortSignal
}
