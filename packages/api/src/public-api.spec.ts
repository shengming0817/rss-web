import { describe, expect, it } from 'vitest'
import * as publicApi from './index'

describe('@rss/api public surface', () => {
  it('does not expose an error constructor or Axios implementation values', () => {
    expect(publicApi).not.toHaveProperty('RssApiError')
    expect(publicApi).not.toHaveProperty('axios')
    expect(publicApi).not.toHaveProperty('http')
    expect(publicApi).not.toHaveProperty('AxiosResponse')
    expect(publicApi).not.toHaveProperty('identityEndpoints')
  })
})
