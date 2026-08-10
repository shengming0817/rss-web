export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'
export type SuccessStatus = 200 | 201 | 204
export type QueryValue = string | number | boolean | undefined
export type Decoder<T> = (value: unknown) => T

interface RequestBase {
  method: HttpMethod
  path: string
  pathParams?: Readonly<Record<string, string | number>>
  query?: Readonly<Record<string, QueryValue>>
  headers?: Readonly<Record<string, string>>
  body?: unknown
  signal?: AbortSignal
  timeoutMs?: number
  session?: 'required'
}

export interface RequestOptions<T> extends RequestBase {
  successStatus: 200 | 201
  decode: Decoder<T>
}

export interface NoContentRequest extends RequestBase {
  successStatus: 204
  decode?: never
}

export interface HttpTransport {
  request(options: NoContentRequest): Promise<void>
  request<T>(options: RequestOptions<T>): Promise<T>
}

export interface CursorPage<T> {
  data: T[]
  hasMore: boolean
  nextCursor?: string
}

export type SafeDetailValue = string | number | boolean
export type SafeDetail = Readonly<Record<string, SafeDetailValue>>

export type RssApiErrorCause = 'wire' | 'aborted' | 'timeout' | 'network' | 'protocol' | 'client'

export type RssApiMessageKey =
  | 'errors.unknown'
  | 'errors.network'
  | 'errors.validation'
  | 'errors.invalidResponse'
  | 'errors.invalidRequest'
  | 'errors.requestAborted'
  | 'errors.requestTimeout'

export interface RssApiError extends Error {
  readonly name: 'RssApiError'
  readonly cause: RssApiErrorCause
  readonly code: string
  readonly messageKey: RssApiMessageKey
  readonly retryable: boolean
  readonly safeDetails: readonly SafeDetail[]
  readonly status?: number
  readonly requestId?: string
}

export interface RssApiErrorInit {
  cause: RssApiErrorCause
  code: string
  messageKey: RssApiMessageKey
  retryable: boolean
  safeDetails?: readonly SafeDetail[]
  status?: number
  requestId?: string
}
