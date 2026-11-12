export type * from './control'
export type * from './trust'
import { createControl, type ControlPort } from './control'
import { createTrust, type TrustPort } from './trust'
import type { DirectoryQuery, Page } from '@rss/mdm-devices'
import { uuid } from '@rss/mdm-inventory'

export type ExecutionKind = 'command' | 'action_run'
export interface ExecutionRef {
  readonly kind: ExecutionKind
  readonly id: string
}
export interface Execution extends ExecutionRef {
  readonly family: string | null
  readonly device: string
  readonly origin: 'direct' | 'policy'
  readonly policy: string | null
  readonly deadline: number
  readonly status: string
}
/** Public owner evidence, admitted by the generated HTTP contract in the adapter. */
export type EvidenceDocument = Readonly<Record<string, unknown>>
interface DetailIdentity {
  readonly id: string
  readonly device: string
  readonly deadline: number
}
export interface CommandDetail extends DetailIdentity {
  readonly kind: 'command'
  readonly owner: 'configuration' | 'device' | 'software' | 'recovery' | 'registration'
  readonly revision: number
  readonly task: {
    readonly name: string
    readonly kind: string
    readonly platform: string
    readonly objects: readonly string[]
  }
  readonly target: EvidenceDocument
  readonly inputVersion: string
  readonly dispatchFailure: EvidenceDocument | null
  readonly authorization: EvidenceDocument & { readonly state: string }
  readonly reauthorization: {
    readonly state: 'available' | 'unavailable' | 'not_applicable'
    readonly confirmationRequired: boolean
    readonly reason: string | null
  } | null
  readonly delivery: string
  readonly observation: EvidenceDocument & { readonly protocol: string; readonly effect: string }
}
export interface RunState {
  readonly delivery: {
    readonly kind: string
    readonly attempt?: string
    readonly leaseUntil?: number
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
interface RunIdentity extends DetailIdentity {
  readonly kind: 'run'
  readonly policyId: string
  readonly versionId: string | null
  readonly occurrence: string | null
  readonly availableAt: number
  readonly attempt: string | null
  readonly state: RunState | null
  readonly delivery: string
  readonly effect: string | null
  readonly authorization: EvidenceDocument | null
}
export type RunDetail = RunIdentity &
  (
    | {
        readonly owner: 'script'
        readonly resourceId: string
        readonly result: EvidenceDocument | null
      }
    | {
        readonly owner: 'collection'
        readonly channel: 'agent' | 'mdm'
        readonly report: EvidenceDocument | null
        readonly result: EvidenceDocument | null
      }
    | {
        readonly owner: 'software' | 'access' | 'credential' | 'enrollment' | 'execution'
        readonly result: EvidenceDocument | string | null
        readonly userAction: string | null
        readonly nodes: readonly (EvidenceDocument & { readonly stepId: string })[]
      }
  )
export type ExecutionDetail = CommandDetail | RunDetail
export interface ExecutionStatistics {
  readonly total: number
  readonly commands: number
  readonly actionRuns: number
  readonly unknown: number
  readonly asOf: number
}
export interface ExecutionPort extends ControlPort, TrustPort {
  statistics(filter?: string, signal?: AbortSignal): Promise<ExecutionStatistics>
  list(query: DirectoryQuery, signal?: AbortSignal): Promise<Page<Execution>>
  command(device: string, id: string, signal?: AbortSignal): Promise<CommandDetail>
  run(policy: string, id: string, signal?: AbortSignal): Promise<RunDetail>
}
export function createExecution(port: ExecutionPort) {
  async function summary(reference: ExecutionRef, signal?: AbortSignal) {
    uuid(reference.id)
    if (!['command', 'action_run'].includes(reference.kind))
      throw new Error('Invalid execution kind')
    const page = await port.list(
      { filter: `id=='${reference.id}';kind=='${reference.kind}'`, limit: 2 },
      signal,
    )
    if (!page.items.length && !page.nextCursor) return null
    if (page.items.length !== 1 || page.nextCursor) throw new Error('Ambiguous execution identity')
    const item = page.items[0]!
    if (item.kind !== reference.kind || item.id !== reference.id)
      throw new Error('Wrong execution identity')
    return item
  }
  return Object.freeze({
    summary,
    ...createControl(port),
    ...createTrust(port),
    statistics: (filter?: string, signal?: AbortSignal) => port.statistics(filter, signal),
    list: (query: DirectoryQuery = {}, signal?: AbortSignal) => port.list(query, signal),
    async detail(reference: ExecutionRef & { readonly policy?: string }, signal?: AbortSignal) {
      uuid(reference.id)
      if (!['command', 'action_run'].includes(reference.kind))
        throw new Error('Invalid execution kind')
      if (reference.kind === 'action_run' && reference.policy) {
        const detail = await port.run(uuid(reference.policy), reference.id, signal)
        if (detail.id !== reference.id) throw new Error('Wrong run identity')
        return { item: null, detail, policy: reference.policy }
      }
      const item = await summary(reference, signal)
      if (!item) return null
      const detail =
        item.kind === 'command'
          ? await port.command(item.device, item.id, signal)
          : item.policy
            ? await port.run(item.policy, item.id, signal)
            : null
      if (
        !detail ||
        detail.id !== item.id ||
        detail.device !== item.device
      )
        throw new Error('Execution target changed; read again')
      return { item, detail, policy: item.policy }
    },
  })
}
