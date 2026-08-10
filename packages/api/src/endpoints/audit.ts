import { defineEndpoint } from './coordinate'
import { INTERNAL_EMPTY, VALIDATION_EMPTY } from './error-rules'

export const auditEndpoints = Object.freeze({
  listEntries: defineEndpoint({
    method: 'GET',
    path: '/api/v1/audit/entries',
    successStatus: 200,
    errorPolicy: Object.freeze({
      400: VALIDATION_EMPTY,
      500: INTERNAL_EMPTY,
    }),
  }),
  listTenantEntries: defineEndpoint({
    method: 'GET',
    path: '/api/v1/audit/tenants/{tenantId}/entries',
    successStatus: 200,
    errorPolicy: Object.freeze({
      400: VALIDATION_EMPTY,
      500: INTERNAL_EMPTY,
      501: Object.freeze({
        code: 'ERR_CORE_NOT_IMPLEMENTED',
        message: 'not implemented',
        retryable: false,
        details: 'empty',
      }),
    }),
  }),
})
