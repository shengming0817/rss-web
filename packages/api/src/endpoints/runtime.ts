import { defineEndpoint } from './coordinate'

export const runtimeEndpoints = Object.freeze({
  inventory: defineEndpoint({
    method: 'GET',
    path: '/api/v1/runtime/inventory',
    successStatus: 200,
    errorPolicy: Object.freeze({
      500: Object.freeze({
        code: 'ERR_CORE_INTERNAL',
        message: 'internal error',
        retryable: false,
        details: 'empty',
      }),
      503: Object.freeze({
        code: 'ERR_CORE_PROVIDER_UNAVAILABLE',
        message: 'provider unavailable',
        retryable: true,
        details: 'empty',
      }),
    }),
  }),
})
