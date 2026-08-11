import type { PoliciesListResponse, PolicyView } from '@rss/identity'

export type PoliciesPaginationState =
  | { readonly status: 'idle'; readonly rows: readonly PolicyView[] }
  | {
      readonly status: 'loading'
      readonly rows: readonly PolicyView[]
      readonly hasMore: boolean
    }
  | { readonly status: 'ready'; readonly rows: readonly PolicyView[]; readonly hasMore: boolean }
  | { readonly status: 'error'; readonly rows: readonly []; readonly error: unknown }

export interface PoliciesPagination {
  getState(): PoliciesPaginationState
  subscribe(listener: (state: PoliciesPaginationState) => void): () => void
  start(): Promise<void>
  next(): Promise<void>
  reset(): void
  dispose(): void
}

type PageLoader = (cursor: string | undefined, signal: AbortSignal) => Promise<PoliciesListResponse>
const EMPTY: readonly PolicyView[] = Object.freeze([])
const IDLE: PoliciesPaginationState = Object.freeze({ status: 'idle', rows: EMPTY })

export function createPoliciesPagination(loadPage: PageLoader): PoliciesPagination {
  const listeners = new Set<(state: PoliciesPaginationState) => void>()
  const seenCursors = new Set<string>()
  const seenPolicyIds = new Set<string>()
  let state = IDLE
  let nextCursor: string | undefined
  let generation = 0
  let controller: AbortController | undefined
  let inFlight: Promise<void> | undefined
  let disposed = false

  function publish(next: PoliciesPaginationState) {
    state = Object.freeze(next)
    for (const listener of listeners) listener(state)
  }

  function fail(error: unknown) {
    nextCursor = undefined
    seenCursors.clear()
    seenPolicyIds.clear()
    publish({ status: 'error', rows: [], error })
  }

  function execute(cursor: string | undefined, append: boolean): Promise<void> {
    if (disposed) return Promise.resolve()
    if (inFlight !== undefined) return inFlight
    const current = generation
    const previous = append && state.status === 'ready' ? state.rows : EMPTY
    if (cursor !== undefined) seenCursors.add(cursor)
    controller = new AbortController()
    const requestController = controller
    publish({
      status: 'loading',
      rows: previous,
      hasMore: append && state.status === 'ready' ? state.hasMore : false,
    })
    const request = (async () => {
      try {
        const page = await loadPage(cursor, requestController.signal)
        if (current !== generation || disposed) return
        const ids = page.data.map((item) => item.policyId)
        if (
          page.nextCursor === '' ||
          page.hasMore !== (page.nextCursor !== undefined) ||
          (page.nextCursor !== undefined && seenCursors.has(page.nextCursor)) ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => seenPolicyIds.has(id))
        ) {
          fail(new Error('invalid policies pagination response'))
          return
        }
        for (const id of ids) seenPolicyIds.add(id)
        const rows = Object.freeze([...previous, ...page.data])
        nextCursor = page.hasMore ? page.nextCursor : undefined
        publish({ status: 'ready', rows, hasMore: page.hasMore })
      } catch (error: unknown) {
        if (current === generation && !requestController.signal.aborted) fail(error)
      }
    })()
    inFlight = request
    void request.finally(() => {
      if (inFlight === request) inFlight = undefined
    })
    return request
  }

  function reset() {
    generation += 1
    controller?.abort()
    controller = undefined
    inFlight = undefined
    nextCursor = undefined
    seenCursors.clear()
    seenPolicyIds.clear()
    if (!disposed) publish(IDLE)
  }

  return Object.freeze({
    getState: () => state,
    subscribe(listener: (state: PoliciesPaginationState) => void) {
      if (disposed) return () => undefined
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start() {
      reset()
      return execute(undefined, false)
    },
    next() {
      if (inFlight !== undefined) return inFlight
      if (state.status !== 'ready' || !state.hasMore || nextCursor === undefined)
        return Promise.resolve()
      return execute(nextCursor, true)
    },
    reset,
    dispose() {
      if (disposed) return
      reset()
      disposed = true
      listeners.clear()
    },
  })
}
