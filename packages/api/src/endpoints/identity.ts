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
})
