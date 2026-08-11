import type { HttpTransport } from '@rss/api'
import { settingsEndpoints } from '@rss/api/endpoints/settings'
import {
  decodeConfigGetResponse,
  decodeConfigPublishResponse,
  decodeConfigRollbackResponse,
} from './config/decoders'
import type {
  ConfigGetResponse,
  ConfigPublishRequest,
  ConfigPublishResponse,
  ConfigRollbackRequest,
  ConfigRollbackResponse,
} from './config/types'
import { decodeSecretPublishResponse, decodeSecretResolveResponse } from './secret/decoders'
import type {
  SecretPublishRequest,
  SecretPublishResponse,
  SecretResolveResponse,
} from './secret/types'
import type { SettingsCallOptions } from './types'

export interface SettingsApi {
  publishSecret(
    request: SecretPublishRequest,
    options?: SettingsCallOptions,
  ): Promise<SecretPublishResponse>
  resolveSecret(key: string, options?: SettingsCallOptions): Promise<SecretResolveResponse>
  publish(
    request: ConfigPublishRequest,
    options?: SettingsCallOptions,
  ): Promise<ConfigPublishResponse>
  get(key: string, options?: SettingsCallOptions): Promise<ConfigGetResponse>
  delete(key: string, options?: SettingsCallOptions): Promise<void>
  rollback(
    key: string,
    request: ConfigRollbackRequest,
    options?: SettingsCallOptions,
  ): Promise<ConfigRollbackResponse>
}

function exactSecretPublishRequest(value: SecretPublishRequest): boolean {
  if (typeof value !== 'object' || value === null) return false
  const keys = Reflect.ownKeys(value)
  const hasVersion = Object.hasOwn(value, 'refVersion')
  return (
    Object.hasOwn(value, 'key') &&
    Object.hasOwn(value, 'storeId') &&
    Object.hasOwn(value, 'refKey') &&
    keys.length === (hasVersion ? 4 : 3) &&
    keys.every(
      (entry) =>
        typeof entry === 'string' &&
        ['key', 'storeId', 'refKey', ...(hasVersion ? ['refVersion'] : [])].includes(entry),
    ) &&
    typeof value.key === 'string' &&
    value.key.length > 0 &&
    typeof value.storeId === 'string' &&
    value.storeId.length > 0 &&
    typeof value.refKey === 'string' &&
    value.refKey.length > 0 &&
    (!hasVersion || typeof value.refVersion === 'string')
  )
}

function key(value: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('invalid config key')
  return value
}

function exactPublishRequest(value: ConfigPublishRequest): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.hasOwn(value, 'key') &&
    Object.hasOwn(value, 'value') &&
    Reflect.ownKeys(value).length === 2 &&
    typeof value.key === 'string' &&
    typeof value.value === 'string'
  )
}

function exactRollbackRequest(value: ConfigRollbackRequest): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.hasOwn(value, 'toVersion') &&
    Reflect.ownKeys(value).length === 1 &&
    Number.isSafeInteger(value.toVersion) &&
    value.toVersion >= 1
  )
}

function signal(options?: SettingsCallOptions) {
  return options?.signal === undefined ? {} : { signal: options.signal }
}

export function createSettingsApi(transport: HttpTransport): SettingsApi {
  return Object.freeze({
    publishSecret(request: SecretPublishRequest, options?: SettingsCallOptions) {
      if (!exactSecretPublishRequest(request))
        return Promise.reject(new Error('invalid secret publish input'))
      const requestKey = request.key
      const body = Object.freeze({
        key: requestKey,
        storeId: request.storeId,
        refKey: request.refKey,
        ...(request.refVersion === undefined || request.refVersion.length === 0
          ? {}
          : { refVersion: request.refVersion }),
      })
      return transport.request({
        ...settingsEndpoints.secretPublish,
        body,
        decode(value) {
          const response = decodeSecretPublishResponse(value)
          if (response.data.key !== requestKey) throw new Error('invalid settings secret response')
          return response
        },
        session: 'required-no-replay',
        ...signal(options),
      })
    },
    resolveSecret(rawKey: string, options?: SettingsCallOptions) {
      const requestKey = key(rawKey)
      return transport.request({
        ...settingsEndpoints.secretResolve,
        pathParams: { key: requestKey },
        decode: decodeSecretResolveResponse,
        session: 'required',
        ...signal(options),
      })
    },
    publish(request: ConfigPublishRequest, options?: SettingsCallOptions) {
      if (!exactPublishRequest(request))
        return Promise.reject(new Error('invalid config publish input'))
      const requestKey = key(request.key)
      return transport.request({
        ...settingsEndpoints.configPublish,
        body: Object.freeze({ key: requestKey, value: request.value }),
        decode(value) {
          const response = decodeConfigPublishResponse(value)
          if (response.data.key !== requestKey) throw new Error('invalid settings config response')
          return response
        },
        session: 'required-no-replay',
        ...signal(options),
      })
    },
    get(rawKey: string, options?: SettingsCallOptions) {
      const requestKey = key(rawKey)
      return transport.request({
        ...settingsEndpoints.configGet,
        pathParams: { key: requestKey },
        decode(value) {
          const response = decodeConfigGetResponse(value)
          if (response.data.key !== requestKey) throw new Error('invalid settings config response')
          return response
        },
        session: 'required',
        ...signal(options),
      })
    },
    delete(rawKey: string, options?: SettingsCallOptions) {
      const requestKey = key(rawKey)
      return transport.request({
        ...settingsEndpoints.configDelete,
        pathParams: { key: requestKey },
        session: 'required',
        ...signal(options),
      })
    },
    rollback(rawKey: string, request: ConfigRollbackRequest, options?: SettingsCallOptions) {
      if (!exactRollbackRequest(request))
        return Promise.reject(new Error('invalid config rollback input'))
      const requestKey = key(rawKey)
      return transport.request({
        ...settingsEndpoints.configRollback,
        pathParams: { key: requestKey },
        body: Object.freeze({ toVersion: request.toVersion }),
        decode(value) {
          const response = decodeConfigRollbackResponse(value)
          if (response.data.key !== requestKey || response.data.sourceVersion !== request.toVersion)
            throw new Error('invalid settings config response')
          return response
        },
        session: 'required-no-replay',
        ...signal(options),
      })
    },
  })
}
