declare const policyIdBrand: unique symbol

export type PolicyId = string & { readonly [policyIdBrand]: true }

export function parsePolicyId(value: unknown): PolicyId | undefined {
  return typeof value === 'string' ? (value as PolicyId) : undefined
}
