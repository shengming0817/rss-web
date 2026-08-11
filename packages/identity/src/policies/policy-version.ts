declare const policyVersionBrand: unique symbol

export type PolicyVersion = number & { readonly [policyVersionBrand]: true }

const INT32_MAX = 2_147_483_647

export function isValidPolicyVersion(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= INT32_MAX
}
