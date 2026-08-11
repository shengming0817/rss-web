declare const policyVersionBrand: unique symbol

export type PolicyVersion = number & { readonly [policyVersionBrand]: true }
