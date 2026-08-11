import type { RequestOptions, RssApiError } from './index'

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
