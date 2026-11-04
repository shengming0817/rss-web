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
  readonly registrationId: string
  readonly generation: number
  readonly origin: 'direct' | 'policy'
  readonly policy: string | null
  readonly deadline: number
  readonly status: string
}
export interface ExecutionDetail {
  readonly revision: number | null
  readonly reauthorization: {
    readonly state: 'available' | 'unavailable' | 'not_applicable'
    readonly confirmationRequired: boolean
    readonly reason: string | null
  } | null
  readonly dispatchFailure: string | null
  readonly taskName: string | null

  readonly id: string
  readonly device: string
  readonly registrationId: string | null
  readonly generation: number | null
  readonly owner: string
  readonly delivery: string
  readonly execution: string | null
  readonly effect: string | null
  readonly cancellation: 'none' | 'requested' | 'confirmed' | null
  readonly attempt: string | null
  readonly deadline: number
  readonly authorization: string | null
}
export interface ExecutionStatistics {
  readonly total: number
  readonly commands: number
  readonly actionRuns: number
  readonly unknown: number
  readonly asOf: number
}
export interface ExecutionPort extends ControlPort, TrustPort {
  statistics(filter?: string): Promise<ExecutionStatistics>
  list(query: DirectoryQuery): Promise<Page<Execution>>
  command(device: string, id: string): Promise<ExecutionDetail>
  run(policy: string, id: string): Promise<ExecutionDetail>
}
export function createExecution(port: ExecutionPort) {
  return Object.freeze({
    ...createControl(port),
    ...createTrust(port),
    statistics: (filter?: string) => port.statistics(filter),
    list: (query: DirectoryQuery = {}) => port.list(query),
    async detail(reference: ExecutionRef & { readonly policy?: string }) {
      uuid(reference.id)
      if (!['command', 'action_run'].includes(reference.kind))
        throw new Error('Invalid execution kind')
      if (reference.kind === 'action_run' && reference.policy) {
        const detail = await port.run(uuid(reference.policy), reference.id)
        if (detail.id !== reference.id) throw new Error('Wrong run identity')
        return { item: null, detail, policy: reference.policy }
      }
      const page = await port.list({
        filter: `id=='${reference.id}';kind=='${reference.kind}'`,
        limit: 2,
      })
      if (!page.items.length && !page.nextCursor) return null
      if (page.items.length !== 1 || page.nextCursor)
        throw new Error('Ambiguous execution identity')
      const item = page.items[0]!
      if (item.kind !== reference.kind || item.id !== reference.id)
        throw new Error('Wrong execution identity')
      const detail =
        item.kind === 'command'
          ? await port.command(item.device, item.id)
          : item.policy
            ? await port.run(item.policy, item.id)
            : null
      if (
        !detail ||
        detail.id !== item.id ||
        detail.device !== item.device ||
        (detail.registrationId !== null && detail.registrationId !== item.registrationId) ||
        (detail.generation !== null && detail.generation !== item.generation)
      )
        throw new Error('Execution target changed; read again')
      return { item, detail, policy: item.policy }
    },
  })
}
