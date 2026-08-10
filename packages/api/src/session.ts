import type { HttpTransport, NoContentRequest, RequestOptions, RssApiError } from './types'
import { authorizeRequest } from './internal/authorization'
import { isRssApiError } from './wire-error'

export interface SessionCredential {
  readonly bearer: string
  readonly generation: number
  readonly lifecycleSignal: AbortSignal
}

export interface SessionTransportHooks {
  authorize(waiterSignal?: AbortSignal): Promise<SessionCredential>
  recover(failedGeneration: number, waiterSignal?: AbortSignal): Promise<SessionCredential>
  invalidate(failedGeneration: number): void
}

function exactUnauthenticated(error: unknown): error is RssApiError {
  return (
    isRssApiError(error) &&
    error.cause === 'wire' &&
    error.status === 401 &&
    error.code === 'ERR_CORE_UNAUTHENTICATED'
  )
}

function combinedSignal(caller: AbortSignal | undefined, lifecycle: AbortSignal): AbortSignal {
  return caller === undefined ? lifecycle : AbortSignal.any([caller, lifecycle])
}

function authorized<T>(
  request: NoContentRequest | RequestOptions<T>,
  credential: SessionCredential,
) {
  return authorizeRequest(
    request,
    credential.bearer,
    combinedSignal(request.signal, credential.lifecycleSignal),
  )
}

async function protectedRequest<T>(
  delegate: HttpTransport,
  hooks: SessionTransportHooks,
  request: NoContentRequest | RequestOptions<T>,
): Promise<T | void> {
  const initial = await hooks.authorize(request.signal)
  try {
    return await delegate.request(authorized(request, initial) as RequestOptions<T>)
  } catch (error: unknown) {
    if (!exactUnauthenticated(error)) throw error
  }

  const recovered = await hooks.recover(initial.generation, request.signal)
  try {
    return await delegate.request(authorized(request, recovered) as RequestOptions<T>)
  } catch (error: unknown) {
    if (exactUnauthenticated(error)) hooks.invalidate(recovered.generation)
    throw error
  }
}

async function protectedNoReplayRequest<T>(
  delegate: HttpTransport,
  hooks: SessionTransportHooks,
  request: NoContentRequest | RequestOptions<T>,
): Promise<T | void> {
  const initial = await hooks.authorize(request.signal)
  try {
    return await delegate.request(authorized(request, initial) as RequestOptions<T>)
  } catch (error: unknown) {
    if (exactUnauthenticated(error)) hooks.invalidate(initial.generation)
    throw error
  }
}

export function createCredentialHttpTransport(
  delegate: HttpTransport,
  credential: SessionCredential,
): HttpTransport {
  return {
    request<T>(request: NoContentRequest | RequestOptions<T>): Promise<T | void> {
      if (request.session === undefined) return delegate.request(request as RequestOptions<T>)
      return delegate.request(authorized(request, credential) as RequestOptions<T>)
    },
  } as HttpTransport
}

export function createSessionHttpTransport(
  delegate: HttpTransport,
  hooks: SessionTransportHooks,
): HttpTransport {
  return {
    request<T>(request: NoContentRequest | RequestOptions<T>): Promise<T | void> {
      if (request.session === undefined) return delegate.request(request as RequestOptions<T>)
      if (request.session === 'required-no-replay')
        return protectedNoReplayRequest(delegate, hooks, request)
      return protectedRequest(delegate, hooks, request)
    },
  } as HttpTransport
}
