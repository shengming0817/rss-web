import type { HttpTransport } from '@rss/api'
import { settingsEndpoints } from '@rss/api/endpoints/settings'
import { decodeConfigGetResponse, decodeConfigPublishResponse } from './decoders'
import type {
  ConfigGetResponse,
  ConfigPublishRequest,
  ConfigPublishResponse,
  SettingsCallOptions,
} from './types'

export interface SettingsApi {
  publish(
    request: ConfigPublishRequest,
    options?: SettingsCallOptions,
  ): Promise<ConfigPublishResponse>
  get(key: string, options?: SettingsCallOptions): Promise<ConfigGetResponse>
  delete(key: string, options?: SettingsCallOptions): Promise<void>
}

function key(value: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('invalid config key')
  return value
}

function signal(options?: SettingsCallOptions) {
  return options?.signal === undefined ? {} : { signal: options.signal }
}

export function createSettingsApi(transport: HttpTransport): SettingsApi {
  return Object.freeze({
    publish(request: ConfigPublishRequest, options?: SettingsCallOptions) {
      const requestKey = key(request.key)
      if (
        typeof request.value !== 'string' ||
        Reflect.ownKeys(request).some((field) => field !== 'key' && field !== 'value')
      )
        return Promise.reject(new Error('invalid config publish input'))
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
  })
}
