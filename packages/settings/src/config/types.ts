declare const configVersionBrand: unique symbol

export type ConfigVersion = number & { readonly [configVersionBrand]: true }

export interface ConfigPublishRequest {
  readonly key: string
  readonly value: string
}

export interface ConfigCoordinate {
  readonly key: string
  readonly version: ConfigVersion
}

export interface ConfigPublishResponse {
  readonly data: ConfigCoordinate
}

export interface ConfigEntry extends ConfigCoordinate {
  readonly value: string
}

export interface ConfigGetResponse {
  readonly data: ConfigEntry
}

export interface ConfigRollbackRequest {
  readonly toVersion: number
}

export interface ConfigRollbackReceipt extends ConfigCoordinate {
  readonly sourceVersion: ConfigVersion
}

export interface ConfigRollbackResponse {
  readonly data: ConfigRollbackReceipt
}

export interface SettingsCallOptions {
  readonly signal?: AbortSignal
}
