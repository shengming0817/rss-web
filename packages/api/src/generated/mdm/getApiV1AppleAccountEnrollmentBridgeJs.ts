/* Generated. Do not edit. */
import { defineEndpoint } from '../../mdm-endpoint'
import type { BinaryResponse } from '../../types'
import * as r from './responses'

export type Input = { signal?: AbortSignal | undefined; timeoutMs?: number | undefined }
export type Output = BinaryResponse

export type * as Response from './s93ddaf583a2133fb6a6f'
export const getApiV1AppleAccountEnrollmentBridgeJs = /* @__PURE__ */ defineEndpoint<Input, Output>(
  {
    ...{
      operationId: 'browser:GET:/api/v1/apple/account-enrollment/bridge.js',
      method: 'GET',
      path: '/api/v1/apple/account-enrollment/bridge.js',
      captures: [],
      pathShape: null,
      queryOwner: null,
      publicRead: true,
      contentType: null,
      requestHeaders: [],
      requiredHeaders: [],
      binary: true,
      statuses: [200],
    },
    checks: { headers: {}, path: null, query: null, body: null },
    responses: [r.rcd5e77fbd7812625e02b],
  },
)
