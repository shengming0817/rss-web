declare const policyVersionBrand: unique symbol

export type PolicyVersion = number & { readonly [policyVersionBrand]: true }

export function sealPolicyVersion(value: number): PolicyVersion {
  return value as PolicyVersion
}
