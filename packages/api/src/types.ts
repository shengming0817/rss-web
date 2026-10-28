import type { EndpointDescription } from './mdm-contract-response'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type QueryValue = string | number | boolean | undefined
export type Decoder<T> = (value: unknown) => T

interface RequestBase {
  /** Internal generated operation binding, preserved by the existing session owner. */
  contract?: EndpointDescription
  method: HttpMethod
  path: string
  pathParams?: Readonly<Record<string, string | number>>
  query?: Readonly<Record<string, QueryValue>>
  headers?: Readonly<Record<string, string>>
  body?: unknown
  signal?: AbortSignal
  timeoutMs?: number
}

export type RequestOptions<T> = RequestBase & {
  responseType?: 'arraybuffer'
  decode: Decoder<T>
} & (
    | { successStatus: 200 | 201 | 202 | readonly [200 | 201 | 202, ...(200 | 201 | 202)[]] }
    | { method: 'GET'; path: '/readyz'; successStatus: readonly [200, 503]; responseType?: never }
  )

export interface BinaryResponse {
  bytes: ArrayBuffer
  contentType: string | null
  contentDisposition: string | null
}

export type NoContentRequest = RequestBase & { decode?: never } & (
    | { successStatus: 204; responseType?: never }
    | { successStatus: 201; responseType: 'empty' }
  )

export interface HttpTransport {
  request(options: NoContentRequest): Promise<void>
  request<T>(options: RequestOptions<T>): Promise<T>
}

export type RssApiErrorCause = 'wire' | 'aborted' | 'timeout' | 'network' | 'protocol' | 'client'

export interface RssApiError extends Error {
  readonly name: 'RssApiError'
  readonly cause: RssApiErrorCause
  readonly code: string
  readonly status?: number
  /** Validated Agent signing attempt locator; never raw error metadata. */
  readonly issuanceId?: string
  /** Validated Identity 429 delta-seconds; never authorizes automatic replay. */
  readonly retryAfterSeconds?: number
}
