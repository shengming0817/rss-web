import { defineEndpoint } from './coordinate'
import {
  INTERNAL_EMPTY,
  NOT_FOUND_EMPTY,
  OUTBOX_FACT_CONFLICT_EMPTY,
  PAYLOAD_TOO_LARGE_EMPTY,
  VALIDATION_EMPTY,
  VALIDATION_PUBLIC,
  VERSION_CONFLICT_EMPTY,
} from './error-rules'

export const settingsEndpoints = Object.freeze({
  secretPublish: defineEndpoint({
    method: 'POST',
    path: '/api/v1/settings/secrets',
    successStatus: 201,
    errorPolicy: Object.freeze({
      400: VALIDATION_EMPTY,
      404: NOT_FOUND_EMPTY,
      409: VERSION_CONFLICT_EMPTY,
      413: PAYLOAD_TOO_LARGE_EMPTY,
      500: INTERNAL_EMPTY,
    }),
  }),
  configPublish: defineEndpoint({
    method: 'POST',
    path: '/api/v1/settings/configs',
    successStatus: 201,
    errorPolicy: Object.freeze({
      400: VALIDATION_PUBLIC,
      409: Object.freeze([VERSION_CONFLICT_EMPTY, OUTBOX_FACT_CONFLICT_EMPTY]),
      413: PAYLOAD_TOO_LARGE_EMPTY,
      500: INTERNAL_EMPTY,
    }),
  }),
  configGet: defineEndpoint({
    method: 'GET',
    path: '/api/v1/settings/configs/{key}',
    successStatus: 200,
    errorPolicy: Object.freeze({
      400: VALIDATION_PUBLIC,
      404: NOT_FOUND_EMPTY,
      500: INTERNAL_EMPTY,
    }),
  }),
  configDelete: defineEndpoint({
    method: 'DELETE',
    path: '/api/v1/settings/configs/{key}',
    successStatus: 204,
    errorPolicy: Object.freeze({
      400: VALIDATION_PUBLIC,
      409: Object.freeze([VERSION_CONFLICT_EMPTY, OUTBOX_FACT_CONFLICT_EMPTY]),
      500: INTERNAL_EMPTY,
    }),
  }),
  configRollback: defineEndpoint({
    method: 'POST',
    path: '/api/v1/settings/configs/{key}/rollbacks',
    successStatus: 201,
    errorPolicy: Object.freeze({
      400: VALIDATION_PUBLIC,
      404: NOT_FOUND_EMPTY,
      409: Object.freeze([VERSION_CONFLICT_EMPTY, OUTBOX_FACT_CONFLICT_EMPTY]),
      413: PAYLOAD_TOO_LARGE_EMPTY,
      500: INTERNAL_EMPTY,
    }),
  }),
})
