export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
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
}

export interface RequestOptions<T> extends RequestBase {
  successStatus: 200 | 201 | 202
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

export type RssApiErrorCause = 'wire' | 'aborted' | 'timeout' | 'network' | 'protocol' | 'client'

export interface RssApiError extends Error {
  readonly name: 'RssApiError'
  readonly cause: RssApiErrorCause
  readonly code: string
  readonly status?: number
}
