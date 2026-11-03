import type { Channel, DeviceRef, DirectoryQuery, Page, WindowQuery } from '@rss/mdm-devices'
import type { Operation } from '@rss/mdm-inventory'

export type ScopeReference = { readonly kind: 'device' | 'group'; readonly id: string }
export interface ScopeDefinition {
  readonly targets: readonly ScopeReference[]
  /** null means unrestricted; [] is an explicitly empty intersection. */
  readonly limitations: readonly ScopeReference[] | null
  readonly exclusions: readonly ScopeReference[]
}
export interface ScopeRead {
  readonly id: string
  readonly revision: number
  readonly definition: ScopeDefinition
  readonly resolution: string | null
  /** Changes with result semantics; independent of the definition revision. */
  readonly resolutionRevision: number
}
export interface ScopeRow {
  readonly id: string
  readonly revision?: number
  readonly deleted?: boolean
  readonly calculationRevision?: number
  readonly resolutionRevision?: number
  readonly resolution?: string | null
}
export type ScopeChange =
  | { readonly action: 'put'; readonly definition: ScopeDefinition }
  | { readonly action: 'delete' }
export interface ScopeReceipt {
  readonly id: string
  readonly revision: number
  readonly task: string | null
}
export interface ScopeTask {
  readonly task: string
  readonly target: string
  readonly kind: 'scope'
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'superseded'
  readonly processed: number
  readonly members: number
  readonly failure: string | null
  readonly failureDetail: { readonly reason: 'group_input_pending' } | null
  readonly replacementTask: string | null
}
export interface ScopeSource {
  readonly reference: ScopeReference
  readonly version: number
}
export interface ScopeDecision {
  readonly object: DeviceRef
  readonly available: boolean
  readonly qualification:
    | { readonly state: 'eligible'; readonly entry: number }
    | { readonly state: 'pending' | 'excluded' }
  readonly reasons: readonly (
    | 'explicit_exclusion'
    | 'missing_limitation_match'
    | 'unknown_target'
    | 'unknown_limitation'
    | 'unknown_exclusion'
  )[]
  readonly targets: readonly ScopeSource[] | null
  readonly limitations: readonly ScopeSource[] | null
  readonly exclusions: readonly ScopeSource[] | null
}
export interface ScopeMember {
  readonly object: DeviceRef
  readonly available: boolean
}
export type ScopeResultKind = 'members' | 'decisions'
export interface ScopeResult {
  readonly scope: string
  readonly result: string
  readonly current: boolean
  readonly channel: Channel
  readonly page:
    | { readonly kind: 'members'; readonly items: readonly ScopeMember[] }
    | { readonly kind: 'decisions'; readonly items: readonly ScopeDecision[] }
  readonly nextCursor: string | null
}
export interface ScopesPort {
  list(query: DirectoryQuery<keyof ScopeRow>): Promise<Page<ScopeRow>>
  read(id: string): Promise<ScopeRead>
  change(id: string, change: Operation<ScopeChange>): Promise<ScopeReceipt>
  task(id: string, task: string): Promise<ScopeTask>
  result(
    id: string,
    result: string,
    kind: ScopeResultKind,
    channel: Channel,
    query: WindowQuery,
  ): Promise<ScopeResult>
}
