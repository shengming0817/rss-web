import type { RoleView, RolesListResponse } from '@rss/identity'

export type RolesPaginationState =
  | { readonly status: 'idle'; readonly rows: readonly RoleView[] }
  | { readonly status: 'loading'; readonly rows: readonly RoleView[] }
  | { readonly status: 'ready'; readonly rows: readonly RoleView[]; readonly hasMore: boolean }
  | { readonly status: 'error'; readonly rows: readonly []; readonly error: unknown }

export interface RolesPagination {
  getState(): RolesPaginationState
  subscribe(listener: (state: RolesPaginationState) => void): () => void
  start(): Promise<void>
  next(): Promise<void>
  reset(): void
  dispose(): void
}

type PageLoader = (cursor: string | undefined, signal: AbortSignal) => Promise<RolesListResponse>
const EMPTY: readonly RoleView[] = Object.freeze([])
const IDLE: RolesPaginationState = Object.freeze({ status: 'idle', rows: EMPTY })

export function createRolesPagination(loadPage: PageLoader): RolesPagination {
  const listeners = new Set<(state: RolesPaginationState) => void>()
  const seenCursors = new Set<string>()
  const seenRoleIds = new Set<string>()
  let state = IDLE
  let nextCursor: string | undefined
  let generation = 0
  let controller: AbortController | undefined
  let inFlight: Promise<void> | undefined
  let disposed = false

  function publish(next: RolesPaginationState) {
    state = Object.freeze(next)
    for (const listener of listeners) listener(state)
  }

  function fail(error: unknown) {
    nextCursor = undefined
    seenCursors.clear()
    seenRoleIds.clear()
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
    publish({ status: 'loading', rows: previous })
    const request = (async () => {
      try {
        const page = await loadPage(cursor, requestController.signal)
        if (current !== generation || disposed) return
        if (
          page.nextCursor === '' ||
          page.hasMore !== (page.nextCursor !== undefined) ||
          (page.nextCursor !== undefined && seenCursors.has(page.nextCursor)) ||
          page.data.some((item, index) =>
            page.data.some((candidate, candidateIndex) =>
              candidateIndex < index ? candidate.roleId === item.roleId : false,
            ),
          ) ||
          page.data.some((item) => seenRoleIds.has(item.roleId))
        ) {
          fail(new Error('invalid roles pagination response'))
          return
        }
        for (const item of page.data) seenRoleIds.add(item.roleId)
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
    seenRoleIds.clear()
    if (!disposed) publish(IDLE)
  }

  return Object.freeze({
    getState: () => state,
    subscribe(listener: (state: RolesPaginationState) => void) {
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
