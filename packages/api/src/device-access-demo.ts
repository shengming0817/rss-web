/** MOCK_SOURCE: explicit loopback HTTP demo executor. Never imported by production. */
import axios from 'axios'
import { execute } from './transport'
import { decodeMdmError } from './mdm'
import { clientError } from './wire-error'
import type { HttpTransport, NoContentRequest, RequestOptions } from './types'
export function createDeviceAccessDemoTransport(): HttpTransport {
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname)) throw clientError()
  const instance = axios.create({ baseURL: '' })
  return {
    async request(options: NoContentRequest | RequestOptions<unknown>) {
      if (!options.path.startsWith('/api/da-demo/') || 'responseType' in options)
        throw clientError()
      return execute(instance, 30_000, options, decodeMdmError)
    },
  } as HttpTransport
}
