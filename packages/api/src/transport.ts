import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import type {
  HttpTransport,
  NoContentRequest,
  QueryValue,
  RequestOptions,
  RssApiError,
} from './types'
import { authorizationFrom } from './internal/authorization'
import {
  abortedError,
  clientError,
  decodeEndpointError,
  isRssApiError,
  networkError,
  protocolError,
  timeoutError,
} from './wire-error'

export interface HttpTransportConfig {
  baseURL?: string
  defaultTimeoutMs: number
}

const PATH_PARAM = /\{([A-Za-z][A-Za-z0-9]*)\}/g
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

function validBaseURL(value: string): boolean {
  if (value === '') return true
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('://') ||
    hasUnsafeUrlCharacter(value) ||
    ENCODED_PATH_SEPARATOR.test(value)
  ) {
    return false
  }
  return new URL(value, URL_BASE).pathname === value
}

function resolvePath(path: string, params: Readonly<Record<string, string | number>> = {}): string {
  if (
    !path.startsWith('/api/') ||
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
  protectedHeaders: Readonly<Record<string, string>>,
): AxiosRequestConfig {
  const timeout = options.timeoutMs ?? defaultTimeoutMs
  if (!positiveTimeout(timeout)) throw clientError()
  const reservedHeader = Object.keys(options.headers ?? {}).some((header) => {
    const normalized = header.toLowerCase()
    return (
      normalized === 'authorization' ||
      normalized === 'x-tenant-id' ||
      normalized === 'cache-control' ||
      normalized === 'pragma'
    )
  })
  if (reservedHeader || (options.cache !== undefined && options.cache !== 'no-store')) {
    throw clientError()
  }
  const headers = {
    ...(options.headers ?? {}),
    ...(options.cache === 'no-store' ? { 'Cache-Control': 'no-store' } : {}),
    ...protectedHeaders,
  }
  return {
    method: options.method,
    url: resolvePath(options.path, options.pathParams),
    timeout,
    validateStatus: () => true,
    ...(options.query === undefined ? {} : { params: resolveQuery(options.query) }),
    ...(Object.keys(headers).length === 0 ? {} : { headers }),
    ...(options.body === undefined ? {} : { data: options.body }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  }
}

export async function execute<T>(
  instance: AxiosInstance,
  defaultTimeoutMs: number,
  options: NoContentRequest | RequestOptions<T>,
  decodeError: (status: number, value: unknown) => RssApiError,
  protectedHeaders: Readonly<Record<string, string>>,
): Promise<T | void> {
  if (options.signal?.aborted === true) throw abortedError()
  try {
    const response = await instance.request(
      requestConfig(options, defaultTimeoutMs, protectedHeaders),
    )
    if (response.status >= 400) throw decodeError(response.status, response.data)
    if (response.status !== options.successStatus) throw protocolError(response.status)
    if (options.successStatus === 204) return undefined
    try {
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

export function createHttpTransport(config: HttpTransportConfig): HttpTransport {
  if (!validBaseURL(config.baseURL ?? '') || !positiveTimeout(config.defaultTimeoutMs)) {
    throw clientError()
  }
  const instance = axios.create({ baseURL: config.baseURL ?? '' })
  return {
    async request(options: NoContentRequest | RequestOptions<unknown>) {
      const authorization = authorizationFrom(options)
      if (
        (options.session !== undefined && authorization === undefined) ||
        (authorization !== undefined &&
          (options.session === undefined || authorization.trim().length === 0))
      )
        throw clientError()
      return execute(
        instance,
        config.defaultTimeoutMs,
        options,
        (status, value) => decodeEndpointError(status, value, options.errorPolicy),
        authorization === undefined ? {} : { Authorization: `Bearer ${authorization}` },
      )
    },
  } as HttpTransport
}
