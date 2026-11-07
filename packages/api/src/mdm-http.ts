import axios from 'axios'
import { isMdmContentRequest, MDM_CONTENT_BODY_LIMIT, mdmJsonBodyLimit } from './mdm-limits'
import { encodeSnapshotRequest } from './mdm-snapshot-json'
import { execute } from './transport'
import { clientError } from './wire-error'
import type { HttpTransport, NoContentRequest, RequestOptions, RssApiError } from './types'
export function createMdmHttpTransport(
  decodeMdmError: (status: number, value: unknown) => RssApiError,
  unpublishedDemo = false,
): HttpTransport {
  const instance = axios.create({ baseURL: '' })
  return {
    async request(options: NoContentRequest | RequestOptions<unknown>) {
      const hostedConfiguration =
        options.method === 'GET' && options.path === '/api/v1/mdm-host/config.json'
      const contract = options.contract
      const demoRequest = unpublishedDemo && options.path.startsWith('/api/v1/mdm-candidate/')
      if (
        !hostedConfiguration &&
        !demoRequest &&
        (!contract || contract.method !== options.method || contract.path !== options.path)
      )
        throw clientError()
      const publicRead = hostedConfiguration || (contract?.publicRead && options.method === 'GET')
      const declaredDownloadHeader = (key: string) =>
        ['range', 'if-range'].includes(key.toLowerCase()) &&
        contract?.requestHeaders.some((name) => name.toLowerCase() === key.toLowerCase())
      if (
        publicRead &&
        (options.method !== 'GET' ||
          options.body !== undefined ||
          Object.keys(options.headers ?? {}).some((key) => !declaredDownloadHeader(key)))
      )
        throw clientError()
      if (options.responseType === 'arraybuffer' && !contract?.binary) throw clientError()
      const content = isMdmContentRequest(options.method, options.path)
      if (
        Object.entries(options.headers ?? {}).some(
          ([key, value]) =>
            !['x-identity-request', 'x-csrf-token', 'idempotency-key'].includes(
              key.toLowerCase(),
            ) &&
            !declaredDownloadHeader(key) &&
            !(key.toLowerCase() === 'content-type' && value === contract?.contentType),
        )
      )
        throw clientError()
      if (content) {
        if (!(options.body instanceof ArrayBuffer) || !options.body.byteLength) throw clientError()
        if (options.body.byteLength > MDM_CONTENT_BODY_LIMIT) throw decodeMdmError(413, undefined)
        return execute(
          instance,
          30_000,
          {
            ...options,
            headers: { ...options.headers, 'Content-Type': 'application/octet-stream' },
          },
          decodeMdmError,
        )
      }
      if (
        options.body instanceof ArrayBuffer ||
        ArrayBuffer.isView(options.body) ||
        (typeof Blob !== 'undefined' && options.body instanceof Blob)
      )
        throw clientError()
      const raw = contract?.rawSnapshot === 'request'
      function checkBudget(encoded: string) {
        const limit = mdmJsonBodyLimit(options.method, options.path)
        if (encoded.length > limit || new TextEncoder().encode(encoded).byteLength > limit)
          throw decodeMdmError(413, undefined)
      }
      const encoded = raw
        ? encodeSnapshotRequest(options.body, checkBudget)
        : JSON.stringify(options.body)
      if (!raw && encoded !== undefined) checkBudget(encoded)
      return execute(
        instance,
        30_000,
        raw ? { ...options, body: encoded } : options,
        decodeMdmError,
      )
    },
  } as HttpTransport
}
