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
} from './wire-error'

const PATH_PARAM = /\{([A-Za-z][A-Za-z0-9_]*)\}/g
const ENCODED_PATH_SEPARATOR = /%(?:2e|2f|5c)/i
const URL_BASE = 'https://rss-web.invalid'

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

export function resolvePath(path: string, params: Readonly<Record<string, string | number>> = {}): string {
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

export async function execute<T>(
  instance: AxiosInstance,
  defaultTimeoutMs: number,
  options: NoContentRequest | RequestOptions<T>,
  decodeError: (status: number, value: unknown, retryAfter: unknown) => RssApiError,
): Promise<T | void> {
  if (options.signal?.aborted === true) throw abortedError()
  try {
    const response = await instance.request(requestConfig(options, defaultTimeoutMs))
    if (options.contract) {
      let data: unknown = response.data
      if (response.status >= 400 && options.responseType === 'arraybuffer' && data instanceof ArrayBuffer) {
        if (data.byteLength > 16_384) throw protocolError(response.status)
        try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)) }
        catch { throw protocolError(response.status) }
      }
      try { validateEndpointResponse(options.contract, response.status, data, response.headers) } catch { throw protocolError(response.status) }
    }
    const readinessUnavailable =
      options.method === 'GET' &&
      options.path === '/readyz' &&
      Array.isArray(options.successStatus) &&
      options.successStatus.length === 2 &&
      options.successStatus[0] === 200 &&
      options.successStatus[1] === 503 &&
      response.status === 503
    if (response.status >= 400 && !readinessUnavailable) {
      let value: unknown = response.data
      if ('responseType' in options && options.responseType === 'arraybuffer') {
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
    const accepted = Array.isArray(options.successStatus)
      ? options.successStatus.includes(response.status)
      : response.status === options.successStatus
    if (!accepted) throw protocolError(response.status)
    if (options.successStatus === 204 || options.responseType === 'empty') return undefined
    try {
      if (options.responseType === 'arraybuffer') {
        const data: unknown = response.data
        if (!(data instanceof ArrayBuffer)) throw protocolError(response.status)
        const header = (name: string) => {
          const value: unknown = response.headers[name]
          if (value === undefined) return null
          if (typeof value !== 'string') throw protocolError(response.status)
          return value
        }
        const binary: BinaryResponse = {
          bytes: data,
          contentType: header('content-type'),
          contentDisposition: header('content-disposition'),
        }
        return options.decode(binary)
      }
      return options.decode(response.data)
    } catch {
      throw protocolError(response.status)
    }
  } catch (error: unknown) {
    if (isRssApiError(error)) throw error
    if (axios.isCancel(error) || (axios.isAxiosError(error) && error.code === 'ERR_CANCELED')) {
      throw abortedError()
    }
    if (
      axios.isAxiosError(error) &&
      (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')
    ) {
      throw timeoutError()
    }
    throw networkError()
  }
}
