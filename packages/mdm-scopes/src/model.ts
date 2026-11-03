import type { Channel, DeviceRef, DirectoryQuery, Page, WindowQuery } from '@rss/mdm-devices'
import type { AssetCut, Operation } from '@rss/mdm-inventory'

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
  | { readonly action: 'delete' | 'recompute' }
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
export interface ScopePreviewRequest {
  readonly definition: ScopeDefinition
  readonly channel: Channel
  readonly editing?: { readonly scopeId: string; readonly expectedRevision: number }
}
export interface ScopePreview {
  readonly items: readonly DeviceRef[]
  readonly channel: Channel
  readonly scanComplete: boolean
  readonly stopReason: 'complete' | 'sample_limit' | 'work_budget'
  readonly hasUnknown: boolean
  readonly inputFingerprint: string
  readonly assetCut: AssetCut
  readonly sources: readonly {
    readonly reference: ScopeReference
    readonly coordinates: {
      readonly definitionVersion: number
      readonly memberVersion: number
      readonly authorityVersion: number
      readonly memberSet: string | null
      readonly assetContext: 'endpoint' | 'associated_device'
    }
    readonly objectSnapshot: string | null
  }[]
  readonly asOf: number
}
export interface ScopeBlocker {
  readonly kind: 'policy'
  readonly id: string
  readonly version: string
  readonly revision: number
  readonly roles: readonly ('policy_scope' | 'rollout_stage')[]
  readonly release: 'edit_referencing_policy' | 'retained_archived_policy'
}
export interface ScopesPort {
  list(query: DirectoryQuery<keyof ScopeRow>): Promise<Page<ScopeRow>>
  read(id: string): Promise<ScopeRead>
  preview(request: ScopePreviewRequest): Promise<ScopePreview>
  references(id: string, query: WindowQuery): Promise<Page<ScopeBlocker>>
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
