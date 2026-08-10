import type { AuditEntriesPage, AuditEntry } from '@rss/audit'

export type AuditPaginationState =
  | { readonly status: 'idle'; readonly rows: readonly AuditEntry[] }
  | { readonly status: 'loading'; readonly rows: readonly AuditEntry[] }
  | {
      readonly status: 'ready'
      readonly rows: readonly AuditEntry[]
      readonly hasMore: boolean
    }
  | { readonly status: 'error'; readonly rows: readonly []; readonly error: unknown }

export interface AuditPagination {
  getState(): AuditPaginationState
  subscribe(listener: (state: AuditPaginationState) => void): () => void
  start(): Promise<void>
  next(): Promise<void>
  reset(): void
  dispose(): void
}

type PageLoader = (cursor: string | undefined, signal: AbortSignal) => Promise<AuditEntriesPage>

const EMPTY: readonly AuditEntry[] = Object.freeze([])
const IDLE: AuditPaginationState = Object.freeze({ status: 'idle', rows: EMPTY })

function paginationError(): Error {
  return new Error('invalid audit pagination response')
}

export function createAuditPagination(loadPage: PageLoader): AuditPagination {
  const listeners = new Set<(state: AuditPaginationState) => void>()
  const seenCursors = new Set<string>()
  const seenSequences = new Set<number>()
  let state = IDLE
  let nextCursor: string | undefined
  let generation = 0
  let controller: AbortController | undefined
  let inFlight: Promise<void> | undefined
  let disposed = false

  function publish(next: AuditPaginationState): void {
    state = Object.freeze(next)
    for (const listener of listeners) listener(state)
  }

  function fail(error: unknown): void {
    nextCursor = undefined
    seenCursors.clear()
    seenSequences.clear()
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
        if (page.nextCursor === '' || page.hasMore !== (page.nextCursor !== undefined)) {
          fail(paginationError())
          return
        }
        if (page.nextCursor !== undefined && seenCursors.has(page.nextCursor)) {
          fail(paginationError())
          return
        }
        const pageSequences = new Set<number>()
        let sequenceBreak = false
        let previousSequence = previous.at(-1)?.seq
        for (const entry of page.data) {
          if (
            pageSequences.has(entry.seq) ||
            seenSequences.has(entry.seq) ||
            (previousSequence !== undefined && entry.seq !== previousSequence + 1)
          ) {
            sequenceBreak = true
          }
          pageSequences.add(entry.seq)
          previousSequence = entry.seq
        }
        if (sequenceBreak) {
          fail(paginationError())
          return
        }
        for (const entry of page.data) seenSequences.add(entry.seq)
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

  function reset(): void {
    generation += 1
    controller?.abort()
    controller = undefined
    inFlight = undefined
    nextCursor = undefined
    seenCursors.clear()
    seenSequences.clear()
    if (!disposed) publish(IDLE)
  }

  return Object.freeze({
    getState: () => state,
    subscribe(listener: (state: AuditPaginationState) => void) {
      if (disposed) return () => undefined
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start() {
      if (inFlight !== undefined) return inFlight
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
