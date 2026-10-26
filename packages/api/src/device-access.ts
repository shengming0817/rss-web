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
      const paths =
        /^\/api\/v1\/(?:mdm-host\/config\.json$|device-views(?:\/|$)|devices(?:\/|$)|device-access\/(?:enterprise\/configuration|broker)(?:\/|$)|audit-events$|policies(?:\/|$))/.test(
          options.path,
        )
      if (
        !paths ||
        'responseType' in options ||
        Object.keys(options.headers ?? {}).some(
          (k) =>
            !['x-identity-request', 'x-csrf-token', 'idempotency-key'].includes(k.toLowerCase()),
        )
      )
        throw clientError()
      return execute(instance, 30_000, options, decodeMdmError)
    },
  } as HttpTransport
}
