import type { HttpMethod, SuccessStatus } from '../types'

interface EndpointCoordinate {
  readonly method: HttpMethod
  readonly path: `/api/${string}`
  readonly successStatus: SuccessStatus
}

const endpoint = <T extends EndpointCoordinate>(coordinate: T): Readonly<T> =>
  Object.freeze(coordinate)

export const identityEndpoints = Object.freeze({
  login: endpoint({ method: 'POST', path: '/api/v1/identity/login', successStatus: 201 }),
  refresh: endpoint({ method: 'POST', path: '/api/v1/identity/refresh', successStatus: 201 }),
  profile: endpoint({ method: 'GET', path: '/api/v1/identity/profile', successStatus: 200 }),
  logout: endpoint({ method: 'POST', path: '/api/v1/identity/logout', successStatus: 200 }),
  logoutAll: endpoint({
    method: 'POST',
    path: '/api/v1/identity/logout-all',
    successStatus: 200,
  }),
})
