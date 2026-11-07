import type {
  Channel,
  DeviceRef,
  DirectoryQuery,
  Page,
  Platform,
  PrimaryRegistration,
  WindowQuery,
  Retirement,
} from '@rss/mdm-devices'
import type { Operation } from '@rss/mdm-inventory'

export type Trigger =
  | { readonly kind: 'manual' | 'registration' }
  | { readonly kind: 'once'; readonly at: number }
  | { readonly kind: 'interval'; readonly anchor: number; readonly seconds: number }
  | {
      readonly kind: 'weekly'
      readonly zone: string
      readonly weekday: number
      readonly minute: number
    }
  | { readonly kind: 'check_in'; readonly minimumSeconds: number }
export interface Schedule {
  readonly trigger: Trigger
  readonly misfire:
    | { readonly kind: 'coalesce_one' }
    | { readonly kind: 'skip'; readonly maxLatenessSeconds: number }
  readonly notBefore: number
  readonly until: number | null
  readonly jitterSeconds: number
  readonly window: {
    readonly zone: string
    readonly weekdays: readonly number[]
    readonly startMinute: number
    readonly endMinute: number
  } | null
}
export type Frequency = 'once_per_version' | 'once_per_entry' | 'every_trigger'
export type Architecture = 'x86_64' | 'aarch64'
export interface ExactResource {
  readonly id: string
  readonly version: string
  readonly platform: Platform
  readonly architecture: Architecture
  readonly variant: string
}
export interface RolloutStage {
  readonly scope: string
  readonly opensAt: number
  readonly minimumVerifiedPercent: number | null
}
export type CredentialIntent =
  | { readonly kind: 'collect_bitlocker' }
  | {
      readonly kind: 'rotate_rss_login' | 'verify_rss_login'
      readonly binding: string
      readonly bindingGeneration: number
      readonly sid: string
    }
  | {
      readonly kind: 'verify_bitlocker' | 'rotate_bitlocker'
      readonly volume: string
      readonly protector: string
    }
  | {
      readonly kind: 'rotate_local_administrator' | 'verify_local_administrator'
      readonly sid: string
    }
export interface MacLogin {
  readonly authentication: 'secure_enclave' | 'password'
  readonly passwordProvider: string | null
  readonly login: 'local' | 'attempt' | 'require'
  readonly unlock: 'local' | 'attempt' | 'require'
  readonly filevault: 'local' | 'attempt' | 'require'
  readonly offlineGraceSeconds: number | null
  readonly registrationGraceSeconds: number | null
  readonly maintenanceAccounts: readonly string[]
}
interface Scheduled {
  readonly schedule: Schedule
  readonly runLifetimeSeconds: number
}
export type PolicyAction =
  | {
      readonly kind: 'device_access'
      readonly mac: MacLogin | null
      readonly windows:
        | { readonly kind: 'disabled' | 'whfb' }
        | {
            readonly kind: 'rss_factor'
            readonly accounts: readonly ('local' | 'active_directory' | 'entra')[]
          }
      readonly selfEnrollment: boolean
      readonly role: 'standard' | 'administrator' | null
    }
  | { readonly kind: 'telemetry_profile'; readonly resource: ExactResource }
  | ({
      readonly kind: 'credential'
      readonly operation: CredentialIntent
      readonly architecture: Architecture
      readonly frequency: Frequency
    } & Scheduled)
  | ({
      readonly kind: 'execution'
      readonly resource: ExactResource
      readonly parameters: Readonly<
        Record<
          string,
          | { readonly kind: 'fixed'; readonly value: string | boolean | number }
          | { readonly kind: 'input' }
        >
      >
      readonly frequency: Frequency
    } & Scheduled)
  | ({
      readonly kind: 'agent_collection' | 'native_collection'
      readonly resource: ExactResource
      readonly frequency: Frequency
    } & Scheduled)
  | {
      readonly kind: 'configuration'
      readonly resource: ExactResource
      readonly exit: 'retain' | 'remove'
    }
  | ({
      readonly kind: 'software'
      readonly channel: Channel
      readonly delivery:
        | { readonly kind: 'direct' }
        | { readonly kind: 'native'; readonly target: string }
      readonly resource: {
        readonly kind: 'software'
        readonly id: string
        readonly version: string
        readonly variants: Readonly<Record<string, string>>
      }
      readonly intent: 'required_install' | 'available_install' | 'explicit_uninstall'
      readonly rollout: { readonly stages: readonly RolloutStage[] }
    } & Scheduled)
  | ({ readonly kind: 'unmanage_device' } & Scheduled)
  | ({
      readonly kind: 'ensure_agent_installed'
      readonly packages: Readonly<Record<string, string>>
    } & Scheduled)
  | ({ readonly kind: 'request_mdm_enrollment'; readonly organization: string } & Scheduled)
export interface UserSource {
  readonly providerId: string
  readonly issuer: string
  readonly configurationVersion: number
}
export type UserSelector =
  | {
      readonly kind: 'user'
      readonly instanceId: string
      readonly tenantId: string
      readonly principalId: string
    }
  | { readonly kind: 'idp_group'; readonly source: UserSource; readonly id: string }
  | {
      readonly kind: 'department'
      readonly source: UserSource
      readonly id: string
      readonly matching: 'exact' | 'subtree'
    }
  | { readonly kind: 'user_group'; readonly id: string }
export interface SelfService {
  readonly access:
    | { readonly kind: 'device' | 'authenticated_user' }
    | { readonly kind: 'users'; readonly selectors: readonly UserSelector[] }
    | null
  readonly published: boolean
  readonly presentation: Readonly<Record<string, unknown>>
  readonly allowAi: boolean | null
  readonly riskLevel: 1 | 2 | null
}
export interface PolicyDefinition {
  readonly scope: string
  readonly action: PolicyAction
  readonly alias: string | null
  readonly customEvent: string | null
  readonly selfService?: SelfService | null
}
export interface Policy {
  readonly id: string
  readonly revision: number
  readonly version: number
  readonly versionId: string
  readonly state: 'enabled' | 'disabled' | 'archived'
  readonly definition: PolicyDefinition
}
export interface PolicyRow extends Partial<Policy> {
  readonly id: string
  readonly action?: PolicyAction['kind']
  readonly scope?: string
  readonly alias?: string | null
  readonly customEvent?: string | null
  readonly toolName?: string
  readonly resource?: string | null
  readonly category?: string | null
}
export type PolicyChange =
  | { readonly action: 'put'; readonly definition: PolicyDefinition; readonly enabled: boolean }
  | { readonly action: 'enable' | 'disable' }
export interface PoliciesPort {
  list(query: DirectoryQuery<keyof PolicyRow>, signal?: AbortSignal): Promise<Page<PolicyRow>>
  read(id: string, signal?: AbortSignal): Promise<Policy>
  change(id: string, change: Operation<PolicyChange>): Promise<Policy>
  archive(id: string, operationId: string, expectedRevision: number): Promise<Policy>
  rerun(
    id: string,
    change: Operation<{ readonly deadline: number }>,
  ): Promise<{
    readonly operationId: string
    readonly policyId: string
    readonly versionId: string
    readonly deadline: number
  }>
  capabilities(): Promise<{
    readonly defaultSoftwareChannel: Channel
    readonly mdmSoftwareDistributionEnabled: boolean
  }>
  preview(
    definition: PolicyDefinition,
    scopeResult: string | null,
    query: WindowQuery,
  ): Promise<PolicyPreview>
  assignments(id: string, query: WindowQuery, signal?: AbortSignal): Promise<Page<Assignment>>
  runs(id: string, query: WindowQuery, signal?: AbortSignal): Promise<Page<PolicyRun>>
  rollout(id: string): Promise<RolloutProgress>
}
export interface Qualification {
  readonly state: 'eligible' | 'pending' | 'excluded'
  readonly entry?: number
}
export type AdmissionState =
  | 'paused'
  | 'mdm_software_disabled'
  | 'outside_window'
  | 'outside_scope'
  | 'scope_pending'
  | 'outside_stage'
  | 'scheduled'
  | 'success_gate'
  | 'missing_registration'
  | 'ambiguous_registration'
  | 'unsupported_capability'
  | 'missing_variant'
  | 'authorization_withdrawn'
  | 'permission_withdrawn'
  | 'channel_unknown'
  | 'projection_pending'
  | 'already_satisfied'
  | 'organization_conflict'
  | 'missing_native_rights'
  | 'missing_architecture'
  | 'installation_pending'
  | 'recovery_observation_pending'
  | 'recovery_retry_exhausted'
  | 'eligible'
  | 'waiting_check_in'
  | 'waiting_trigger'
  | 'interval_not_elapsed'
  | 'execution_pending'
  | 'frequency_consumed'
  | 'effect_unknown'
  | 'capacity_busy'
  | 'schedule_ended'
  | 'input_required'
  | 'lifecycle_blocked'
  | 'report_source_unavailable'
export interface TargetFacts {
  readonly object: DeviceRef
  readonly channel: Channel | null
  readonly availability: 'ready' | 'unavailable'
  readonly reason: string | null
  readonly target: PrimaryRegistration | null
  readonly taskAdmission: {
    readonly state: AdmissionState
    readonly stage?: number | null
    readonly nextAllowedStartAt?: number | null
  } | null
}
export interface Assignment extends TargetFacts {
  readonly qualification: Qualification
  readonly sources: readonly {
    readonly object: DeviceRef
    readonly associationVersion: number | null
    readonly verified: boolean
    readonly members: readonly PrimaryRegistration[]
  }[]
  readonly scopeResult: string | null
  readonly execution:
    | { readonly kind: 'operations'; readonly operationIds: readonly string[] }
    | {
        readonly kind: 'recurring'
        readonly latestRun: PolicyRun | null
        readonly currentRecord:
          | { readonly state: 'unknown' }
          | { readonly state: 'absent' }
          | { readonly state: 'present'; readonly taskId: string }
      }
    | { readonly kind: 'restricted' }
}
export interface PolicyPreview {
  readonly action: PolicyAction
  readonly scopeResult: string
  readonly items: readonly (TargetFacts & {
    readonly eligibility: Qualification
    readonly collectionSupported?: boolean | null
  })[]
  readonly nextCursor: string | null
}
export interface RunProgress {
  readonly delivery:
    | { readonly kind: 'queued' }
    | {
        readonly kind: 'claimed' | 'received'
        readonly attempt: string
        readonly leaseUntil: number
      }
  readonly execution:
    | 'not_started'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'waiting_reboot'
    | 'unknown'
  readonly cancellation: 'none' | 'requested' | 'confirmed'
  readonly deadline: number
  readonly startedAt: number | null
}
export interface PolicyRun {
  readonly versionId: string | null
  readonly kind:
    | 'software'
    | 'access'
    | 'credential'
    | 'enrollment'
    | 'execution'
    | 'script'
    | 'collection'
  readonly nativeDelivery: 'queued' | 'prepared' | 'sent' | 'cancelled' | null
  readonly report: {
    readonly id: string
    readonly result: string
    readonly reason: string | null
    readonly sealedAt: number | null
    readonly projectionPending: boolean
  } | null
  readonly taskId: string
  readonly device: string
  readonly registrationId: string
  readonly generation: number
  readonly occurrence: string
  readonly availableAt: number
  readonly deadline: number
  readonly state: RunProgress | null
  readonly effect: string | null
  readonly userAction: string | null
}
export interface RolloutProgress {
  readonly policyId: string
  readonly versionId: string
  readonly paused: boolean
  readonly asOf: number
  readonly stages: readonly (RolloutStage & {
    readonly ready: boolean
    readonly asOf: number | null
    readonly open: boolean
    readonly totalTargets: number
    readonly reported: number
    readonly unknown: number
    readonly waitingUser: number
    readonly waitingReboot: number
    readonly failed: number
    readonly verifiedSuccess: number
    readonly unsupportedCapability: number
  })[]
}
export type EventState = 'pending' | 'accepted' | 'no_change' | 'rejected' | 'expired'
export interface EventRequest {
  readonly operationId: string
  readonly event: string
  readonly source: { readonly kind: 'human' | 'ai' }
}
export interface EventAccepted {
  readonly operationId: string
  readonly batchId: string
  readonly members: number
}
export interface EventBatch {
  readonly id: string
  readonly operationId: string
  readonly event: string
  readonly createdAt: number
  readonly deadline: number
  readonly members: number
  readonly admission: Readonly<Partial<Record<EventState, number>>>
  readonly processingFailure: string | null
  readonly request: {
    readonly operationId: string
    readonly event: string
    readonly source:
      | { readonly kind: 'human' | 'ai' }
      | { readonly kind: 'policy'; readonly runId: string }
  }
}
export interface EventOperation {
  readonly kind: 'run' | 'native' | 'retirement'
  readonly id: string
}
export type EventDecision =
  | { readonly state: 'pending' | 'expired' }
  | { readonly state: 'accepted'; readonly operations: readonly EventOperation[] }
  | { readonly state: 'no_change' | 'rejected'; readonly reason: string }
export type EventProgress =
  | { readonly reference: EventOperation & { readonly kind: 'run' }; readonly state: RunProgress }
  | {
      readonly reference: EventOperation & { readonly kind: 'native' }
      readonly state:
        | 'queued'
        | 'published'
        | 'received'
        | 'applied'
        | 'rejected'
        | 'timed_out'
        | 'superseded'
        | 'cancelled'
    }
  | {
      readonly reference: EventOperation & { readonly kind: 'retirement' }
      readonly state: Retirement
    }
export interface EventMember {
  readonly id: string
  readonly policyId: string
  readonly versionId: string
  readonly revision: number
  readonly state: EventState
  readonly decision: EventDecision
  readonly operations: readonly EventProgress[]
}
export interface PolicyEventsPort {
  lookupOriginal(device: string, operationId: string): Promise<Page<EventBatch>>
  submit(device: string, request: EventRequest): Promise<EventAccepted>
  batches(
    device: string,
    query: DirectoryQuery<keyof EventBatch>,
    signal?: AbortSignal,
  ): Promise<Page<EventBatch>>
  batch(device: string, batch: string, signal?: AbortSignal): Promise<EventBatch>
  members(
    device: string,
    batch: string,
    query: DirectoryQuery<keyof EventMember>,
    signal?: AbortSignal,
  ): Promise<Page<EventMember>>
}
