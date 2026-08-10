import { defineEndpoint } from './coordinate'

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
      400: Object.freeze({
        code: 'ERR_CORE_VALIDATION',
        message: 'validation failed',
        retryable: false,
        details: 'public',
      }),
      404: Object.freeze({
        code: 'ERR_CORE_NOT_FOUND',
        message: 'not found',
        retryable: false,
        details: 'empty',
      }),
      409: Object.freeze({
        code: 'ERR_CORE_VERSION_CONFLICT',
        message: 'version conflict',
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
