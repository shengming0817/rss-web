import type { DeviceRef, DirectoryQuery, Page, DeviceMember, WindowQuery } from '@rss/mdm-devices'
import type { AssetContext, ConditionContext, Operation, Predicate } from '@rss/mdm-inventory'

export type GroupCriteria =
  | Predicate
  | { readonly kind: 'group'; readonly groupId: string; readonly op: 'member_of' | 'not_member_of' }
  | { readonly kind: 'and' | 'or'; readonly children: readonly GroupCriteria[] }
export interface GroupCondition extends ConditionContext {
  readonly criteria: GroupCriteria
}
export interface Group {
  readonly id: string
  readonly kind: 'static' | 'dynamic' | 'system'
  readonly systemSelector: 'all_active' | 'windows' | 'macos' | null
  readonly assetContext: AssetContext
  readonly presentation: Readonly<Record<string, unknown>>
  readonly revision: number
  readonly calculationRevision: number
  readonly memberVersion: number
  readonly memberCount: number
  readonly ruleVersion: string | null
  readonly deleted: boolean
}
export interface GroupRow extends Partial<Group> {
  readonly id: string
}
export interface GroupRead {
  readonly group: Group
  readonly criteria: GroupCondition | null
  readonly memberSet: string | null
  readonly freshness: 'current' | 'pending'
}
export interface GroupQuery extends DirectoryQuery<keyof Group> {
  readonly referenceableFor?: string
}
export type GroupChange =
  | {
      readonly action: 'create'
      readonly presentation: Readonly<Record<string, unknown>>
      readonly criteria: GroupCondition | null
      readonly assetContext: AssetContext
    }
  | { readonly action: 'edit'; readonly presentation: Readonly<Record<string, unknown>> }
  | { readonly action: 'rule'; readonly criteria: GroupCondition }
  | {
      readonly action: 'members'
      readonly add: readonly DeviceRef[]
      readonly remove: readonly DeviceRef[]
    }
  | { readonly action: 'delete' | 'recompute' }
export interface GroupReceipt {
  readonly operation: string
  readonly group: Group
  readonly added: number
  readonly removed: number
  readonly task: string | null
}
export interface TaskAccepted {
  readonly task: string
  readonly kind: 'group' | 'group_preview' | 'group_definition'
  readonly target: string
  readonly statusUrl: string
}
export interface GroupTask {
  readonly task: string
  readonly kind: TaskAccepted['kind']
  readonly target: string
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'superseded'
  readonly processed: number
  readonly members: number
  readonly failure: string | null
  readonly failureDetail: { readonly reason: 'group_input_pending' } | null
  readonly replacementTask: string | null
}
export interface SourceCoordinates {
  readonly definitionVersion: number
  readonly memberVersion: number
  readonly authorityVersion: number
  readonly memberSet: string | null
  readonly assetContext: AssetContext
}
export type DecisionValue =
  | 'match'
  | 'no_match'
  | 'unknown'
  | 'null'
  | 'missing'
  | 'deleted'
  | 'unsupported'
  | 'conflict'
export interface Decision {
  readonly object: DeviceRef
  readonly origin: 'rule' | 'manual' | 'system'
  readonly decision: DecisionValue
  readonly explanations: readonly {
    readonly context: string
    readonly path: readonly number[]
    readonly outcome: DecisionValue
  }[]
  readonly provenance: readonly {
    readonly context: string
    readonly field: string
    readonly source: string
    readonly snapshot_id: string
    readonly observed_at: number
  }[]
  readonly sourceObjects: readonly {
    readonly object: DeviceRef
    readonly associationVersion: number | null
    readonly verified: boolean
    readonly members: readonly DeviceMember[]
  }[]
}
export type ResultKind = 'members' | 'changes' | 'decisions'
export interface GroupResult {
  readonly result: string
  readonly group: string
  readonly current: boolean
  readonly sources: readonly { readonly group: string; readonly coordinates: SourceCoordinates }[]
  readonly totalObjects: number
  readonly totalMembers: number
  readonly page:
    | { readonly kind: 'members'; readonly items: readonly DeviceRef[] }
    | {
        readonly kind: 'changes'
        readonly added: readonly DeviceRef[]
        readonly removed: readonly DeviceRef[]
      }
    | { readonly kind: 'decisions'; readonly items: readonly Decision[] }
  readonly nextCursor: string | null
}
export type ReferenceKind = 'group' | 'scope' | 'policy' | 'compliance_rule'
export interface ReferenceObject {
  readonly kind: ReferenceKind
  readonly id: string
}
export interface Impact {
  readonly source: ReferenceObject
  readonly revision: number
  readonly relation: 'direct' | 'indirect'
  readonly roles: readonly string[]
  readonly via: readonly ReferenceObject[]
  readonly lifecycleState: 'active' | 'enabled' | 'disabled' | 'archived'
  readonly freshness: 'current' | 'pending'
  readonly effective: boolean
}
export interface ImpactQuery extends WindowQuery {
  readonly kind?: ReferenceKind
  readonly relation?: 'all' | 'direct' | 'indirect'
}
export interface Reference {
  readonly kind: 'group' | 'scope' | 'compliance_rule'
  readonly id: string
  readonly revision: number
  readonly roles: readonly (
    | 'group_condition'
    | 'target'
    | 'limitation'
    | 'exclusion'
    | 'compliance_target'
  )[]
  readonly policy: string | null
  readonly stage: string | null
  readonly release: 'edit_or_delete_referencing_object' | 'edit_policy_scope_or_retire_owner'
}
export type References = Page<Reference>
export type ReferenceQuery = WindowQuery
export interface GroupPreviewRequest {
  readonly criteria: GroupCondition
  readonly assetContext: AssetContext
  readonly editing?: { readonly groupId: string; readonly expectedRevision: number }
}
export interface GroupPreview {
  readonly items: readonly DeviceRef[]
  readonly scanComplete: boolean
  readonly inputFingerprint: string
  readonly assetCut: { readonly tenant: string; readonly epoch: string; readonly snapshot: string }
  readonly objectSnapshot: string | null
  readonly sources: readonly { readonly group: string; readonly coordinates: SourceCoordinates }[]
  readonly asOf: number
}
export interface GroupsPort {
  list(query: GroupQuery, signal?: AbortSignal): Promise<Page<GroupRow>>
  read(id: string): Promise<GroupRead>
  change(id: string, change: Operation<GroupChange>): Promise<GroupReceipt | TaskAccepted>
  preview(request: GroupPreviewRequest): Promise<GroupPreview>
  task(group: string, task: string): Promise<GroupTask>
  result(group: string, result: string, kind: ResultKind, query: WindowQuery): Promise<GroupResult>
  references(group: string, query: ReferenceQuery): Promise<References>
  impacts(group: string, query: ImpactQuery): Promise<Page<Impact>>
}
