declare const secretVersionBrand: unique symbol

export type SecretVersion = number & { readonly [secretVersionBrand]: true }

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
