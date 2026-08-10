import type { EndpointErrorPolicy, HttpMethod, SuccessStatus } from '../types'

export interface EndpointCoordinate {
  readonly method: HttpMethod
  readonly path: `/api/${string}`
  readonly successStatus: SuccessStatus
  readonly errorPolicy?: EndpointErrorPolicy
}

export const defineEndpoint = <const T extends EndpointCoordinate>(coordinate: T): Readonly<T> =>
  Object.freeze(coordinate)
