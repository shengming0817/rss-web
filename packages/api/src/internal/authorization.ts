import type { NoContentRequest, RequestOptions } from '../types'

export const AUTHORIZATION = Symbol('rss.session.authorization')

export type TransportRequest<T = unknown> = NoContentRequest | RequestOptions<T>
export type AuthorizedRequest<T = unknown> = TransportRequest<T> & {
  readonly [AUTHORIZATION]: string
}

export function authorizeRequest<T>(
  request: TransportRequest<T>,
  bearer: string,
  signal: AbortSignal,
): AuthorizedRequest<T> {
  return {
    ...request,
    signal,
    [AUTHORIZATION]: bearer,
  }
}

export function authorizationFrom(request: TransportRequest): string | undefined {
  return (request as Partial<AuthorizedRequest>)[AUTHORIZATION]
}
