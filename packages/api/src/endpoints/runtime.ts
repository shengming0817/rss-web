import { defineEndpoint } from './coordinate'
import { INTERNAL_EMPTY } from './error-rules'

export const runtimeEndpoints = Object.freeze({
  inventory: defineEndpoint({
    method: 'GET',
    path: '/api/v1/runtime/inventory',
    successStatus: 200,
    errorPolicy: Object.freeze({
      500: INTERNAL_EMPTY,
      503: Object.freeze({
        code: 'ERR_CORE_PROVIDER_UNAVAILABLE',
        message: 'provider unavailable',
        retryable: true,
        details: 'empty',
      }),
    }),
  }),
})
