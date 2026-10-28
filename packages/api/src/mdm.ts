/** MDM browser protocol policy over the shared HTTP executor. No retries. */
import { errorResponses } from './generated/mdm/errors'
import { decodeIdentityError } from './identity'
import { createMdmHttpTransport } from './mdm-http'
import { identityWireFailure, agentWireFailure, protocolError } from './wire-error'
import type { HttpTransport, RssApiError } from './types'
export type {
  BinaryResponse,
  HttpTransport,
  NoContentRequest,
  RequestOptions,
  RssApiError,
} from './types'
export { isRssApiError } from './wire-error'
export function decodeMdmError(status: number, value: unknown): RssApiError {
  if (status === 413) return identityWireFailure(413, 'request_too_large')
  const identity = decodeIdentityError(status, value)
  if (identity.cause === 'wire') return identity
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !errorResponses.some((r) => r.status === status && r.validate(value))
  )
    return protocolError(status)
  const code = Reflect.get(value, 'code')
  if (typeof code !== 'string') return protocolError(status)
  const issuance = Reflect.get(value, 'issuanceId')
  return typeof issuance === 'string'
    ? agentWireFailure(status, code, issuance)
    : identityWireFailure(status, code)
}
export function createMdmTransport(): HttpTransport {
  return createMdmHttpTransport(decodeMdmError)
}
