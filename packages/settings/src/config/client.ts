import type { HttpTransport } from '@rss/api'
import { settingsEndpoints } from '@rss/api/endpoints/settings'
import {
  decodeConfigGetResponse,
  decodeConfigPublishResponse,
  decodeConfigRollbackResponse,
} from './decoders'
import type {
  ConfigGetResponse,
  ConfigPublishRequest,
  ConfigPublishResponse,
  ConfigRollbackRequest,
  ConfigRollbackResponse,
  SettingsCallOptions,
} from './types'

export interface SettingsApi {
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
