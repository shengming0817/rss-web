import type { Channel, DeviceRef, WindowQuery } from '@rss/mdm-devices'
import type { AssetCut } from '@rss/mdm-inventory'

export type ScopeReference = { readonly kind: 'device' | 'group'; readonly id: string }
export interface ScopeDefinition {
  readonly targets: readonly ScopeReference[]
  /** null means unrestricted; [] is an explicitly empty intersection. */
  readonly limitations: readonly ScopeReference[] | null
  readonly exclusions: readonly ScopeReference[]
}
export interface ScopeOwner {
  readonly policyId: string
  readonly stageId?: string
}
export interface ScopeRead {
  readonly stage: string | null
  readonly retired: boolean
  readonly task: string | null
  readonly id: string
  readonly revision: number
  readonly definition: ScopeDefinition
  readonly resolution: string | null
  /** Changes with result semantics; independent of the definition revision. */
  readonly resolutionRevision: number
}
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
  readonly failureDetail: { readonly reason: string } | null
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
  readonly expectedRevision: number
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
export interface ScopesPort {
  read(owner: ScopeOwner, signal?: AbortSignal): Promise<ScopeRead>
  preview(
    owner: ScopeOwner,
    request: ScopePreviewRequest,
    signal?: AbortSignal,
  ): Promise<ScopePreview>
  recompute(
    owner: ScopeOwner,
    request: { readonly operationId: string; readonly expectedRevision: number },
  ): Promise<ScopeReceipt>
  task(owner: ScopeOwner, scope: string, task: string, signal?: AbortSignal): Promise<ScopeTask>
  result(
    owner: ScopeOwner,
    scope: string,
    result: string,
    kind: ScopeResultKind,
    channel: Channel,
    query: WindowQuery,
    signal?: AbortSignal,
  ): Promise<ScopeResult>
}
