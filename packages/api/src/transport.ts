import axios from 'axios'
import { validateEndpointResponse } from './mdm-contract-response'
import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import type {
  BinaryResponse,
  NoContentRequest,
  QueryValue,
  RequestOptions,
  RssApiError,
} from './types'
import {
  abortedError,
  clientError,
  isRssApiError,
  networkError,
  protocolError,
  timeoutError,
  withRequestId,
} from './wire-error'

const PATH_PARAM = /\{([A-Za-z][A-Za-z0-9_]*)\}/g
const ENCODED_PATH_SEPARATOR = /%(?:2e|2f|5c)/i
const URL_BASE = 'https://rss-web.invalid'
const MAX_BINARY_RANGE_BYTES = 16 * 1024 * 1024

function positiveTimeout(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function hasUnsafeUrlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0)!
    return (
      character === '\\' ||
      character === '?' ||
      character === '#' ||
      codePoint < 32 ||
      codePoint === 127
    )
  })
}

export function resolvePath(
  path: string,
  params: Readonly<Record<string, string | number>> = {},
): string {
  if (
    (!path.startsWith('/api/') && path !== '/readyz') ||
    path.startsWith('//') ||
    path.includes('://') ||
    hasUnsafeUrlCharacter(path) ||
    ENCODED_PATH_SEPARATOR.test(path)
  )
    throw clientError()
  const used = new Set<string>()
  const resolved = path.replace(PATH_PARAM, (_match, key: string) => {
    const raw = params[key]
    if (
      raw === undefined ||
      (typeof raw === 'number' && !Number.isFinite(raw)) ||
      String(raw).length === 0
    ) {
      throw clientError()
    }
    if (raw === '.' || raw === '..') throw clientError()
    used.add(key)
    return encodeURIComponent(String(raw))
  })
  if (resolved.includes('{') || resolved.includes('}')) throw clientError()
  if (Object.keys(params).some((key) => !used.has(key))) throw clientError()
  if (new URL(resolved, URL_BASE).pathname !== resolved) throw clientError()
  return resolved
}

function resolveQuery(
  query?: Readonly<Record<string, QueryValue>>,
): Record<string, string | number | boolean> | undefined {
  if (query === undefined) return undefined
  const result: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    if (typeof value === 'number' && !Number.isFinite(value)) throw clientError()
    result[key] = value
  }
  return result
}

export function requestConfig(
  options: NoContentRequest | RequestOptions<unknown>,
  defaultTimeoutMs: number,
): AxiosRequestConfig {
  const timeout = options.timeoutMs ?? defaultTimeoutMs
  if (!positiveTimeout(timeout)) throw clientError()
  const headers = { ...options.headers, 'Cache-Control': 'no-store' }
  return {
    method: options.method,
    url: resolvePath(options.path, options.pathParams),
    timeout,
    validateStatus: () => true,
    ...(options.responseType === 'arraybuffer' ? { responseType: options.responseType } : {}),
    ...(options.query === undefined ? {} : { params: resolveQuery(options.query) }),
    headers,
    ...(options.body === undefined ? {} : { data: options.body }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  }
}

/** Read only the selected range budget. The public boundary still returns the existing owned ArrayBuffer. */
async function boundedBinary(
  stream: unknown,
  headers: Readonly<Record<string, unknown>>,
  maximumBytes: number,
  status: number,
  controller: AbortController,
): Promise<ArrayBuffer> {
  if (!(stream instanceof ReadableStream)) {
    if (stream instanceof ArrayBuffer) new Uint8Array(stream).fill(0)
    throw protocolError(status)
  }
  const reader = stream.getReader(),
    abortRead = () => {
      void reader.cancel().catch(() => undefined)
    }
  controller.signal.addEventListener('abort', abortRead, { once: true })
  let bytes: Uint8Array<ArrayBuffer> | undefined,
    offset = 0,
    complete = false
  try {
    const declared: unknown = Object.entries(headers).find(
      ([name]) => name.toLowerCase() === 'content-length',
    )?.[1]
    if (
      declared !== undefined &&
      (typeof declared !== 'string' ||
        !/^\d+$/.test(declared) ||
        !Number.isSafeInteger(Number(declared)) ||
        Number(declared) > maximumBytes)
    )
      throw protocolError(status)
    bytes = new Uint8Array(maximumBytes)
    for (;;) {
      if (controller.signal.aborted) throw abortedError()
      const { done, value }: ReadableStreamReadResult<unknown> = await reader.read()
      if (done) {
        if (controller.signal.aborted) throw abortedError()
        complete = true
        break
      }
      if (!(value instanceof Uint8Array)) throw protocolError(status)
      try {
        if (controller.signal.aborted) throw abortedError()
        if (value.byteLength > maximumBytes - offset) throw protocolError(status)
        bytes.set(value, offset)
        offset += value.byteLength
      } finally {
        value.fill(0)
      }
    }
    if (declared !== undefined && offset !== Number(declared)) throw protocolError(status)
    if (offset === bytes.byteLength) {
      const result = bytes.buffer
      bytes = undefined
      return result
    }
    return bytes.buffer.slice(0, offset)
  } finally {
    bytes?.fill(0)
    controller.signal.removeEventListener('abort', abortRead)
    if (!complete) {
      controller.abort()
      // Cancelling an already errored stream can reject; the request signal has also been aborted.
      await reader.cancel().catch(() => undefined)
    }
    reader.releaseLock()
  }
}

function sameOriginResponse(request: unknown): boolean {
  if (typeof location === 'undefined') return true
  const url =
    request instanceof Request && request.mode === 'same-origin'
      ? request.url
      : typeof request === 'object' &&
          request !== null &&
          'responseURL' in request &&
          typeof request.responseURL === 'string'
        ? request.responseURL
        : null
  if (!url) return false
  try {
    return new URL(url).origin === location.origin
  } catch {
    return false
  }
}

export async function execute<T>(
  instance: AxiosInstance,
  defaultTimeoutMs: number,
  options: NoContentRequest | RequestOptions<T>,
  decodeError: (status: number, value: unknown, retryAfter: unknown) => RssApiError,
  preserveRequestId = false,
): Promise<T | void> {
  if (options.signal?.aborted === true) throw abortedError()
  const range =
    options.responseType === 'arraybuffer' && options.method === 'GET'
      ? Object.entries(options.headers ?? {}).find(([name]) => name.toLowerCase() === 'range')?.[1]
      : undefined
  const closedRange = range?.match(/^bytes=(\d+)-(\d+)$/)
  let maximumBytes: number | undefined
  if (closedRange) {
    const start = Number(closedRange[1]),
      end = Number(closedRange[2])
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      !Number.isSafeInteger(end - start + 1) ||
      end - start + 1 > MAX_BINARY_RANGE_BYTES
    )
      throw clientError()
    maximumBytes = end - start + 1
  }
  const bounded = maximumBytes === undefined ? undefined : new AbortController(),
    cancelBounded = () => bounded?.abort()
  let timedOut = false,
    deadline: ReturnType<typeof setTimeout> | undefined,
    binaryOwned: ArrayBuffer | undefined,
    responseRequestId: unknown
  options.signal?.addEventListener('abort', cancelBounded, { once: true })
  try {
    const config = requestConfig(options, defaultTimeoutMs)
    if (bounded && maximumBytes !== undefined) {
      if (typeof ReadableStream === 'undefined') throw clientError()
      // Use Axios' stream adapter inside the same executor and instance. XHR progress cannot bound buffering.
      // ref: axios v1.16.1 lib/adapters/fetch.js and lib/helpers/trackStream.js.
      config.adapter = 'fetch'
      if (preserveRequestId) config.fetchOptions = { mode: 'same-origin' }
      config.responseType = 'stream'
      config.signal = bounded.signal
      const timeout = config.timeout!
      config.timeout = 0
      deadline = setTimeout(() => {
        timedOut = true
        bounded.abort()
      }, timeout)
      if (options.signal?.aborted) bounded.abort()
    }
    const response = await instance.request(config)
    if (preserveRequestId && sameOriginResponse(response.request))
      responseRequestId = Object.entries(response.headers).find(
        ([name]) => name.toLowerCase() === 'x-request-id',
      )?.[1]
    if (bounded && maximumBytes !== undefined) {
      response.data = await boundedBinary(
        response.data,
        response.headers,
        response.status >= 400 ? 16384 : maximumBytes,
        response.status,
        bounded,
      )
    }
    if (options.responseType === 'arraybuffer' && response.data instanceof ArrayBuffer) {
      binaryOwned = response.data
    }
    if (options.contract) {
      let data: unknown = response.data
      if (
        response.status >= 400 &&
        response.status !== 413 &&
        options.responseType === 'arraybuffer' &&
        data instanceof ArrayBuffer
      ) {
        if (data.byteLength > 16_384) throw protocolError(response.status)
        try {
          data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data))
        } catch {
          throw protocolError(response.status)
        }
      }
      try {
        validateEndpointResponse(options.contract, response.status, data, response.headers)
      } catch {
        throw protocolError(response.status)
      }
    }
    const accepted = Array.isArray(options.successStatus)
      ? options.successStatus.includes(response.status)
      : response.status === options.successStatus
    if (response.status >= 400 && !accepted) {
      let value: unknown = response.data
      if (response.status === 413 && options.responseType === 'arraybuffer') value = undefined
      else if ('responseType' in options && options.responseType === 'arraybuffer') {
        if (!(value instanceof ArrayBuffer) || value.byteLength > 16_384)
          throw protocolError(response.status)
        try {
          value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(value))
        } catch {
          throw protocolError(response.status)
        }
      }
      const retryAfter = Object.entries(response.headers).find(
        ([name]) => name.toLowerCase() === 'retry-after',
      )?.[1]
      throw decodeError(response.status, value, retryAfter)
    }
    if (!accepted) throw protocolError(response.status)
    if (options.successStatus === 204 || options.responseType === 'empty') return undefined
    try {
      if (options.responseType === 'arraybuffer') {
        const data: unknown = response.data
        if (!(data instanceof ArrayBuffer)) throw protocolError(response.status)
        const header = (name: string) => {
          const value: unknown = Object.entries(response.headers).find(
            ([key]) => key.toLowerCase() === name,
          )?.[1]
          if (value === undefined) return null
          if (typeof value !== 'string') throw protocolError(response.status)
          return value
        }
        const binary: BinaryResponse = {
          bytes: data,
          status: response.status,
          contentType: header('content-type'),
          contentDisposition: header('content-disposition'),
          contentLength: header('content-length'),
          contentRange: header('content-range'),
          etag: header('etag'),
        }
        const decoded = options.decode(binary)
        binaryOwned = undefined
        return decoded
      }
      return options.decode(response.data)
    } catch {
      throw protocolError(response.status)
    }
  } catch (error: unknown) {
    if (binaryOwned) new Uint8Array(binaryOwned).fill(0)
    if (options.signal?.aborted) throw withRequestId(abortedError(), responseRequestId)
    if (timedOut) throw withRequestId(timeoutError(), responseRequestId)
    if (isRssApiError(error)) throw withRequestId(error, responseRequestId)
    if (axios.isCancel(error) || (axios.isAxiosError(error) && error.code === 'ERR_CANCELED')) {
      throw withRequestId(abortedError(), responseRequestId)
    }
    if (
      axios.isAxiosError(error) &&
      (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')
    ) {
      throw withRequestId(timeoutError(), responseRequestId)
    }
    throw withRequestId(networkError(), responseRequestId)
  } finally {
    if (deadline !== undefined) clearTimeout(deadline)
    options.signal?.removeEventListener('abort', cancelBounded)
  }
}
