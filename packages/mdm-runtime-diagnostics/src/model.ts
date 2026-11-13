/** Current owner observations. Scheduling, health and authorization remain server facts. */
export const owners = [
  'baseline',
  'telemetry',
  'inventory',
  'policy',
  'group',
  'scope',
  'asset_query',
  'compliance',
  'device_associations',
  'scope_group_delivery',
  'asset_input_delivery',
  'device_control',
  'software_deployment',
  'native_installation',
  'script_execution',
  'collection_execution',
  'enrollment_tasks',
  'device_access_execution',
  'native_recovery_credentials',
  'mdm_credential_tasks',
  'da_credential_tasks',
] as const
export type Owner = (typeof owners)[number]
export type Health = 'healthy' | 'degraded' | 'unknown' | 'not_applicable'
export type Readiness = 'ready' | 'not_ready' | 'not_applicable'
export type Task = 'unknown' | 'pending' | 'running' | 'cancelled' | 'completed' | 'failed'
export type ProgressState =
  | 'unobserved'
  | 'pending'
  | 'running'
  | 'caught_up'
  | 'limited'
  | 'failed'
  | 'unavailable'
export interface Queue {
  readonly name: string
  readonly count: number | null
  readonly truncated: boolean | null
}
export interface Progress {
  readonly state: ProgressState
  readonly confirmedPosition: number | null
  readonly sourceHead: number | null
  readonly lagging: boolean | null
  readonly invocationAgeMs: number | null
  readonly completedPassAgeMs: number | null
  readonly sourceObservationAgeMs: number | null
  readonly applied: number | null
}
export interface RunResult {
  readonly successful: boolean
  readonly reason?: string | null
  readonly observedAt: number | null
}
export interface Component {
  readonly name: Owner
  readonly mounted: boolean
  readonly phases: readonly {
    readonly name: 'recovery' | 'relay' | 'inputs'
    readonly state: 'unobserved' | 'healthy' | 'failed'
    readonly reason?: string | null
  }[]
  readonly readiness: Readiness
  readonly health: Health
  readonly task: Task | null
  readonly reasons: readonly string[]
  readonly dependencies: readonly {
    readonly name: string
    readonly state: 'available' | 'unavailable'
    readonly reason?: string | null
  }[]
  readonly queues: readonly Queue[]
  readonly progress: Progress | null
  readonly runner: {
    readonly scan: RunResult | null
    readonly unresolvedAttempts: number
    readonly truncated: boolean
    readonly latestFailure: {
      readonly stage: 'observe' | 'apply' | 'renew' | 'finish'
      readonly reason: string
      readonly observedAt: number | null
    } | null
  } | null
  readonly dispatch: { readonly eventAfter: number; readonly windowOpen: boolean } | null
}
export interface Channel {
  readonly name: 'windows' | 'apple' | 'agent' | 'windows_push' | 'agent_bootstrap' | 'signing'
  readonly state: 'disabled' | 'waiting' | 'ready' | 'degraded'
  readonly mounted: boolean
  readonly loadedMaterials: Readonly<Record<string, number>>
  readonly reasons: readonly string[]
}
export type FirstUse =
  | {
      readonly access: 'available'
      readonly summary: {
        readonly revision: number
        readonly canComplete: boolean
        readonly complete: boolean
        readonly steps: readonly {
          readonly id: string
          readonly status:
            | 'ready'
            | 'unconfigured'
            | 'pending'
            | 'unknown'
            | 'unavailable'
            | 'forbidden'
            | 'skipped'
        }[]
      }
    }
  | { readonly access: 'forbidden' | 'unavailable' }
export interface Snapshot {
  readonly alive: boolean
  readonly ready: boolean
  readonly components: readonly Component[]
  readonly channels: readonly Channel[]
  readonly firstUse: FirstUse | null
}
export interface DiagnosticsPort {
  snapshot(signal?: AbortSignal): Promise<Snapshot>
}
