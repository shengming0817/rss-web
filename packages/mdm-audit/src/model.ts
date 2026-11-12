import type { Page, WindowQuery } from '@rss/mdm-devices'

/** Search uses server recording time, independently of the producer observation time. */
export interface AuditQuery extends WindowQuery {
  readonly targetId?: string | undefined
  readonly targetType?: string | undefined
  readonly device?: string | undefined
  readonly requestId?: string | undefined
  readonly operationId?: string | undefined
  readonly actor?: string | undefined
  readonly action?: string | undefined
  readonly outcome?: 'succeeded' | 'denied' | 'failed' | 'unknown' | undefined
  readonly from?: number | undefined
  readonly until?: number | undefined
}
export type TimelineQuery = Omit<AuditQuery, 'device'>
export interface AuditFact {
  readonly origin: 'request' | 'background' | null
  readonly source: string
  readonly eventId: string
  readonly position: number
  readonly recordedAt: number
  readonly observedAt: number
  readonly actorKind: string
  readonly actor: string
  readonly action: string
  readonly target: { readonly type: string; readonly id: string }
  readonly deviceId: string | null
  readonly operationId: string | null
  readonly relatedOperationIds: readonly string[]
  readonly requestId: string | null
  readonly registrationRequestId: string | null
  readonly instanceId: string | null
  readonly auditOutcome: string
  readonly phase: string
  readonly executionState: string | null
  readonly effect: string
  readonly requestWriteOutcome: string | null
  readonly requestReplayed: boolean
  readonly supported: boolean
}
export interface AuditPage extends Page<AuditFact> {
  /** Index observation only, never a cryptographic ledger verification. */
  readonly coverage: { readonly complete: boolean }
}
export interface ActivityQuery extends WindowQuery {
  readonly from?: number | undefined
  readonly until?: number | undefined
  readonly source?: string | undefined
  readonly kind?: string | undefined
  readonly status?: string | undefined
  readonly policy?: string | undefined
  readonly request?: string | undefined
  readonly batch?: string | undefined
  readonly task?: string | undefined
  readonly operation?: string | undefined
  readonly related?: string | undefined
}
export type OperationReference = {
  readonly kind: 'run' | 'native' | 'retirement'
  readonly id: string
}
export interface ActivityLinks {
  readonly policy: string | null
  readonly version: string | null
  readonly batch: string | null
  readonly member: string | null
  readonly request: string | null
  readonly operation: string | null
  readonly retirement: string | null
  readonly task: string | null
  readonly attempt: string | null
  readonly steps: readonly string[]
  readonly operations: readonly OperationReference[]
}
export interface ManagementActivity {
  readonly id: string
  readonly source: string
  readonly kind: 'policy' | 'assignment' | 'batch' | 'execution' | 'configuration'
  readonly phase:
    | 'changed'
    | 'assigned'
    | 'withdrawn'
    | 'accepted'
    | 'offered'
    | 'dispatched'
    | 'received'
    | 'started'
    | 'reporting'
    | 'result'
    | 'reconciled'
    | 'cancelled'
    | 'decided'
  readonly recordedAt: number
  readonly observedAt: number
  readonly origin: 'system' | 'policy' | 'human' | 'ai'
  /** May be an authorized paired channel rather than the path device. */
  readonly target: {
    readonly device: string
  } | null
  readonly links: ActivityLinks
  readonly delivery: 'queued' | 'offered' | 'dispatched' | 'received' | 'unknown' | null
  readonly execution:
    | 'not_started'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'waiting_reboot'
    | 'unknown'
    | 'queued'
    | 'published'
    | 'received'
    | 'applied'
    | 'rejected'
    | 'timed_out'
    | 'superseded'
    | 'cancelled'
    | null
  readonly effect:
    | 'verified'
    | 'failed'
    | 'unknown'
    | 'waiting_reboot'
    | 'diverged'
    | 'waiting'
    | 'unverifiable'
    | null
  readonly reporting: 'partial' | 'acknowledged' | null
  readonly decision:
    | 'pending'
    | 'accepted'
    | 'no_change'
    | 'rejected'
    | 'expired'
    | 'cancelled'
    | 'cancellation_requested'
    | 'assigned'
    | 'unavailable'
    | null
  readonly auditOutcome: string
}
export interface ActivityPage extends Page<ManagementActivity> {
  /** Returned as a fact; this browser contract provides no incremental endpoint. */
  readonly syncCursor: string
  readonly asOf: number
  readonly retainedFrom: number | null
  readonly coverage: readonly {
    readonly source: string
    readonly complete: boolean
    readonly reasons: readonly string[]
  }[]
}
export interface ActivityDetail {
  readonly activity: ManagementActivity
  readonly personal: false
  readonly related: readonly ManagementActivity[]
  readonly relatedCursor: string | null
  readonly missing: readonly string[]
  readonly asOf: number
}
export type PolicyAddress =
  | { readonly kind: 'id'; readonly id: string }
  | { readonly kind: 'tool_name'; readonly name: string }
  | { readonly kind: 'alias'; readonly alias: string }
/** Current address information for locating audit facts; no configuration or execution model. */
export interface AuditPolicyIdentity {
  readonly id: string
  readonly toolName: string
  readonly alias: string | null
  readonly customEvent: string | null
  readonly state: 'enabled' | 'disabled' | 'archived'
  readonly revision: number
  readonly versionId: string
}
export interface AuditPort {
  search(query: AuditQuery): Promise<AuditPage>
  timeline(device: string, query: TimelineQuery): Promise<AuditPage>
  activities(device: string, query: ActivityQuery): Promise<ActivityPage>
  activity(device: string, id: string): Promise<ActivityDetail>
}
export interface AuditPolicyLookupPort {
  resolve(address: PolicyAddress): Promise<AuditPolicyIdentity>
  byEvent(event: string, query: WindowQuery): Promise<Page<AuditPolicyIdentity>>
}
