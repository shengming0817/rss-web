import { describe, expect, it } from 'vitest'
import axios from 'axios'
import { http } from './http'
import { isRssRequestError, toI18nKey } from './errors'

describe('request foundation', () => {
  it('exposes an unconfigured axios instance', () => {
    expect(typeof http.request).toBe('function')
    expect(http.defaults.baseURL).toBeUndefined()
    expect(http.defaults.headers.common.Authorization).toBeUndefined()
  })

  it('maps non-http and network failures to stable generic keys', () => {
    expect(toI18nKey(new Error('boom'))).toBe('errors.unknown')
    expect(toI18nKey(new axios.AxiosError('offline'))).toBe('errors.network')
  })

  it('recognizes axios errors without assuming an RSS error contract', () => {
    expect(isRssRequestError(new axios.AxiosError('failure'))).toBe(true)
    expect(isRssRequestError(new Error('failure'))).toBe(false)
  })
})
