export type * from './model'
export { defaultSchedule, validateDefinition, validateSchedule } from './authoring'
import type { DirectoryQuery, WindowQuery } from '@rss/mdm-devices'
import type { Operation } from '@rss/mdm-inventory'
import { freeze, operation, uuid } from '@rss/mdm-inventory'
import { validateDefinition } from './authoring'
import type {
  PoliciesPort,
  Policy,
  PolicyChange,
  PolicyRow,
  PolicyDefinition,
  PolicyEventsPort,
  EventBatch,
  EventMember,
  EventRequest,
} from './model'

function identity(value: Policy, id: string): Policy {
  if (value.id !== id) throw new Error('Wrong policy detail')
  return value
}
export function createPolicies(port: PoliciesPort) {
  return Object.freeze({
    list: (query: DirectoryQuery<keyof PolicyRow> = {}) => port.list(query),
    read: async (id: string) => identity(await port.read(uuid(id)), id),
    capabilities: () => port.capabilities(),
    async preview(
      definition: PolicyDefinition,
      scopeResult: string | null = null,
      query: WindowQuery = {},
    ) {
      validateDefinition(definition)
      if (scopeResult !== null) uuid(scopeResult)
      const value = await port.preview(freeze(definition), scopeResult, query)
      if (scopeResult !== null && value.scopeResult !== scopeResult)
        throw new Error('Wrong preview scope result')
      return value
    },
    assignments: (id: string, query: WindowQuery = {}) => port.assignments(uuid(id), query),
    runs: (id: string, query: WindowQuery = {}) => port.runs(uuid(id), query),
    async rollout(id: string) {
      const value = await port.rollout(uuid(id))
      if (value.policyId !== id) throw new Error('Wrong rollout policy')
      return value
    },
    async change(id: string, change: Operation<PolicyChange>) {
      uuid(id)
      operation(change)
      if (change.input.action === 'put') validateDefinition(change.input.definition)
      const value = identity(await port.change(id, freeze(change)), id)
      if (value.revision !== change.expectedRevision + 1) throw new Error('Wrong policy revision')
      return value
    },
    async archive(id: string, operationId: string, expectedRevision: number) {
      uuid(id)
      operation({ operationId, expectedRevision, input: {} })
      const value = identity(await port.archive(id, operationId, expectedRevision), id)
      if (value.state !== 'archived') throw new Error('Wrong policy archive receipt')
      return value
    },
    async rerun(id: string, change: Operation<{ readonly deadline: number }>) {
      uuid(id)
      operation(change)
      if (!Number.isSafeInteger(change.input.deadline)) throw new Error('Invalid rerun deadline')
      const value = await port.rerun(id, freeze(change))
      if (
        value.policyId !== id ||
        value.operationId !== change.operationId ||
        value.deadline !== change.input.deadline
      )
        throw new Error('Wrong policy rerun receipt')
      return value
    },
  })
}
/** Each explicit event keeps its identity independently of coalesced membership recalculation. */
export function createPolicyEvents(port: PolicyEventsPort) {
  return Object.freeze({
    async submit(device: string, request: EventRequest) {
      if (!device || /\p{Cc}/u.test(device)) throw new Error('Invalid event device')
      uuid(request.operationId)
      if (
        !/^[a-z0-9._-]{1,64}$/.test(request.event) ||
        !['human', 'ai'].includes(request.source.kind)
      )
        throw new Error('Invalid event request')
      const value = await port.submit(device, freeze(request))
      if (value.operationId !== request.operationId) throw new Error('Wrong event receipt')
      uuid(value.batchId)
      return value
    },
    batches: (device: string, query: DirectoryQuery<keyof EventBatch> = {}) =>
      port.batches(device, query),
    async batch(device: string, id: string) {
      const value = await port.batch(device, uuid(id))
      if (value.id !== id) throw new Error('Wrong event batch')
      return value
    },
    members: (device: string, batch: string, query: DirectoryQuery<keyof EventMember> = {}) =>
      port.members(device, uuid(batch), query),
  })
}
