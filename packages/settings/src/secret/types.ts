declare const secretVersionBrand: unique symbol
declare const secretMaterialBase64Brand: unique symbol

export type SecretVersion = number & { readonly [secretVersionBrand]: true }
export type SecretMaterialBase64 = string & { readonly [secretMaterialBase64Brand]: true }

export interface SecretPublishRequest {
  readonly key: string
  readonly storeId: string
  readonly refKey: string
  readonly refVersion?: string
}

export interface SecretPublishReceipt {
  readonly key: string
  readonly version: SecretVersion
}

export interface SecretPublishResponse {
  readonly data: SecretPublishReceipt
}

export interface SecretResolveData {
  readonly materialBase64: SecretMaterialBase64
}

export interface SecretResolveResponse {
  readonly data: SecretResolveData
}
