import type { HttpMethod, SuccessStatus } from '../types'

interface EndpointCoordinate {
  readonly method: HttpMethod
  readonly path: `/api/${string}`
  readonly successStatus: SuccessStatus
}

const endpoint = <T extends EndpointCoordinate>(coordinate: T): Readonly<T> =>
  Object.freeze(coordinate)

export const runtimeEndpoints = Object.freeze({
  inventory: endpoint({
    method: 'GET',
    path: '/api/v1/runtime/inventory',
    successStatus: 200,
  }),
})
