/**
 * loadStatus.ts — shared async-load state machine for observability stores/views.
 *
 * Single source of truth for the four-state load lifecycle used by the health
 * and observe stores (and the components that render off their status):
 *   - idle:        not yet fetched
 *   - loading:     request in flight
 *   - loaded:      data present
 *   - unavailable: degraded (endpoint absent / error) — render the fallback panel
 */
export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'unavailable'
