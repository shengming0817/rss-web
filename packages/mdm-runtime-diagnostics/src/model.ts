/** Candidate presentation contract for #3140. No old aggregate is translated into these owners. */
export const owners = [
  'baseline',
  'telemetry',
  'inventory',
  'policy',
  'group',
  'scope',
  'scope_group_changes',
  'device_associations',
  'device_control',
  'software',
  'installation',
  'script',
  'collection',
  'enrollment',
  'device_access',
  'recovery_credentials',
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
  readonly applied: number | null
}
export interface Component {
  readonly owner: Owner
  readonly readiness: Readiness
  readonly health: Health
  readonly task: Task | null
  readonly reasons: readonly string[]
  readonly dependencies: readonly {
    readonly name: string
    readonly state: 'available' | 'unavailable' | 'unknown'
  }[]
  readonly queues: readonly Queue[]
  readonly progress: Progress | null
  readonly recovery: {
    readonly unresolvedAttempts: number
    readonly truncated: boolean
    readonly lastFailure: string | null
  } | null
}
export interface Channel {
  readonly name: 'windows' | 'apple' | 'agent' | 'windows_push' | 'agent_bootstrap' | 'signing'
  readonly state: 'disabled' | 'waiting' | 'ready' | 'degraded'
  readonly mounted: boolean
  readonly loadedMaterials: Readonly<Record<string, number>>
  readonly reasons: readonly string[]
}
export interface Snapshot {
  readonly source: 'live' | 'mock'
  readonly alive: boolean
  readonly ready: boolean
  readonly components: readonly Component[]
  readonly channels: readonly Channel[]
}
export interface DiagnosticsPort {
  snapshot(): Promise<Snapshot>
}
