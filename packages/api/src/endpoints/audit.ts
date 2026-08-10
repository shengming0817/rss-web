import { defineEndpoint } from './coordinate'

export const auditEndpoints = Object.freeze({
  listEntries: defineEndpoint({
    method: 'GET',
    path: '/api/v1/audit/entries',
    successStatus: 200,
    errorPolicy: Object.freeze({
      400: Object.freeze({
        code: 'ERR_CORE_VALIDATION',
        message: 'validation error',
        retryable: false,
        details: 'empty',
      }),
      500: Object.freeze({
        code: 'ERR_CORE_INTERNAL',
        message: 'internal error',
        retryable: false,
        details: 'empty',
      }),
    }),
  }),
})
