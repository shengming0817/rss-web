import type { RequestOptions, ResponseRequestOptions, RssApiError } from './index'

// @ts-expect-error RSS API errors are minted internally after sanitization.
const forbiddenConstructor: new (init: unknown) => RssApiError = RssApiError
void forbiddenConstructor

const noStoreRequest: RequestOptions<unknown> = {
  method: 'GET',
  path: '/api/v1/settings/secrets/key/material',
  cache: 'no-store',
  successStatus: 200,
  decode: (value) => value,
}
void noStoreRequest
// @ts-expect-error cache behavior is a closed transport vocabulary
const reloadRequest: RequestOptions<unknown> = { ...noStoreRequest, cache: 'reload' }
void reloadRequest

const creation: ResponseRequestOptions<boolean> = {
  method: 'POST',
  path: '/api/v1/platform/tenants',
  successStatus: [201, 202],
  decode: (_value, status) => status === 201,
}
void creation
// @ts-expect-error A status-aware response decoder cannot be called without the HTTP status.
creation.decode({})
creation.decode({}, 202)
