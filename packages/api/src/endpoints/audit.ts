import type { HttpMethod, SuccessStatus } from '../types'

interface EndpointCoordinate {
  readonly method: HttpMethod
  readonly path: `/api/${string}`
  readonly successStatus: SuccessStatus
}

const endpoint = <T extends EndpointCoordinate>(coordinate: T): Readonly<T> =>
  Object.freeze(coordinate)

export const auditEndpoints = Object.freeze({
  listEntries: endpoint({ method: 'GET', path: '/api/v1/audit/entries', successStatus: 200 }),
})
