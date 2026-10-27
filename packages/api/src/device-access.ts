/** DA protocol policy on the existing executor. Only public service routes; no fallback. */
import axios from 'axios'
import { execute } from './transport'
import { decodeMdmError } from './mdm'
import { clientError } from './wire-error'
import type { HttpTransport, NoContentRequest, RequestOptions } from './types'
export function createDeviceAccessTransport(): HttpTransport {
  const instance = axios.create({ baseURL: '' })
  return {
    async request(options: NoContentRequest | RequestOptions<unknown>) {
      if (
        !options.contract &&
        !(options.method === 'GET' && options.path === '/api/v1/mdm-host/config.json')
      )
        throw clientError()
      if (
        options.contract &&
        (options.method !== options.contract.method || options.path !== options.contract.path)
      )
        throw clientError()
      if (
        Object.entries(options.headers ?? {}).some(
          ([k, v]) =>
            !['x-identity-request', 'x-csrf-token', 'idempotency-key'].includes(k.toLowerCase()) &&
            !(k.toLowerCase() === 'content-type' && v === options.contract?.contentType),
        )
      )
        throw clientError()
      return execute(instance, 30_000, options, decodeMdmError)
    },
  } as HttpTransport
}
