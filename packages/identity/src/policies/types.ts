import type { CursorPage } from '@rss/api'
import type { PolicyId } from './policy-id'

export type PolicyAttributeOperand = Readonly<{
  kind: 'attribute'
  valueType: 'string'
  attribute:
    | 'principal.kind'
    | 'principal.id'
    | 'tenant.id'
    | 'contract.id'
    | 'permission'
    | 'resource.id'
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
      predicate: 'eq' | 'ne'
      operand: PolicyLiteralOperand | PolicyAttributeOperand
    }>
  | Readonly<{
      family: 'ordering'
      predicate: 'gt' | 'ge' | 'lt' | 'le'
      operand: PolicyNumericOperand
    }>
  | Readonly<{
      family: 'membership'
      predicate: 'in' | 'notIn'
      operand: PolicySetOperand
    }>
  | Readonly<{
      family: 'string'
      predicate: 'startsWith' | 'endsWith' | 'contains' | 'glob' | 'regex'
      operand: PolicyPatternOperand
    }>

export interface PolicyObligations {
  readonly rowScope?: 'selfOnly' | 'device' | 'tenant'
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
