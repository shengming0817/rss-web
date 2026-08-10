import type { HttpTransport } from '@rss/api'
import { runtimeEndpoints } from '@rss/api/endpoints/runtime'
import { decodeRuntimeInventoryResponse } from './decoders'
import type { RuntimeCallOptions, RuntimeInventoryResponse } from './types'

export interface RuntimeApi {
  inventory(options?: RuntimeCallOptions): Promise<RuntimeInventoryResponse>
}

export function createRuntimeApi(transport: HttpTransport): RuntimeApi {
  return Object.freeze({
    inventory(options?: RuntimeCallOptions) {
      return transport.request({
        ...runtimeEndpoints.inventory,
        decode: decodeRuntimeInventoryResponse,
        session: 'required',
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
      })
    },
  })
}
