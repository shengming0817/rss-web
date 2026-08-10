import { defineEndpoint } from './coordinate'
import {
  INTERNAL_EMPTY,
  NOT_FOUND_EMPTY,
  OUTBOX_FACT_CONFLICT_EMPTY,
  VALIDATION_PUBLIC,
} from './error-rules'

export const identityEndpoints = Object.freeze({
  login: defineEndpoint({ method: 'POST', path: '/api/v1/identity/login', successStatus: 201 }),
  refresh: defineEndpoint({ method: 'POST', path: '/api/v1/identity/refresh', successStatus: 201 }),
  profile: defineEndpoint({ method: 'GET', path: '/api/v1/identity/profile', successStatus: 200 }),
  logout: defineEndpoint({ method: 'POST', path: '/api/v1/identity/logout', successStatus: 200 }),
  logoutAll: defineEndpoint({
    method: 'POST',
    path: '/api/v1/identity/logout-all',
    successStatus: 200,
  }),
  passwordChange: defineEndpoint({
    method: 'POST',
    path: '/api/v1/identity/password/change',
    successStatus: 200,
    errorPolicy: Object.freeze({
      400: VALIDATION_PUBLIC,
      404: NOT_FOUND_EMPTY,
      409: Object.freeze({
        code: 'ERR_CORE_VERSION_CONFLICT',
        message: 'version conflict',
        retryable: true,
        details: 'empty',
      }),
      500: INTERNAL_EMPTY,
    }),
  }),
  accountStatusGet: defineEndpoint({
    method: 'GET',
    path: '/api/v1/identity/accounts/{userId}/status',
    successStatus: 200,
    errorPolicy: Object.freeze({
      404: NOT_FOUND_EMPTY,
      500: INTERNAL_EMPTY,
    }),
  }),
  accountStatusSet: defineEndpoint({
    method: 'PUT',
    path: '/api/v1/identity/accounts/{userId}/status',
    successStatus: 200,
    errorPolicy: Object.freeze({
      400: VALIDATION_PUBLIC,
      404: NOT_FOUND_EMPTY,
      409: Object.freeze([
        Object.freeze({
          code: 'ERR_CORE_CONFLICT',
          message: 'conflict',
          retryable: false,
          details: 'empty',
        }),
        Object.freeze({
          code: 'ERR_CORE_VERSION_CONFLICT',
          message: 'version conflict',
          retryable: true,
          details: 'empty',
        }),
      ]),
      500: INTERNAL_EMPTY,
    }),
  }),
  rolesList: defineEndpoint({
    method: 'GET',
    path: '/api/v1/identity/roles',
    successStatus: 200,
    errorPolicy: Object.freeze({
      400: VALIDATION_PUBLIC,
      500: INTERNAL_EMPTY,
    }),
  }),
  rolesAssign: defineEndpoint({
    method: 'POST',
    path: '/api/v1/identity/roles/{roleId}/bindings',
    successStatus: 201,
    errorPolicy: Object.freeze({
      400: VALIDATION_PUBLIC,
      404: NOT_FOUND_EMPTY,
      409: OUTBOX_FACT_CONFLICT_EMPTY,
      500: INTERNAL_EMPTY,
    }),
  }),
  rolesRevoke: defineEndpoint({
    method: 'DELETE',
    path: '/api/v1/identity/roles/{roleId}/bindings/{subject}',
    successStatus: 200,
    errorPolicy: Object.freeze({
      400: VALIDATION_PUBLIC,
      409: OUTBOX_FACT_CONFLICT_EMPTY,
      500: INTERNAL_EMPTY,
    }),
  }),
})
