export type * from './model'
import type { Channel, DirectoryQuery, WindowQuery } from '@rss/mdm-devices'
import type { Operation } from '@rss/mdm-inventory'
import { freeze, identifier, operation, uuid } from '@rss/mdm-inventory'
import type {
  ScopeChange,
  ScopeDefinition,
  ScopeReference,
  ScopeResultKind,
  ScopeRow,
  ScopePreviewRequest,
  ScopesPort,
} from './model'

export function validateDefinition(definition: ScopeDefinition): void {
  const sources = new Set<string>()
  for (const items of [definition.targets, definition.limitations, definition.exclusions]) {
    const seen = new Set<string>()
    for (const item of items ?? []) {
      validateReference(item)
      const key = JSON.stringify([item.kind, item.id])
      if (seen.has(key)) throw new Error('Duplicate scope reference')
      seen.add(key)
      sources.add(key)
    }
  }
  if (sources.size > 1000) throw new Error('Scope source budget exceeded')
}
function validateReference(value: ScopeReference): void {
  if (value.kind === 'group') uuid(value.id)
  else if (value.kind === 'device') identifier(value.id)
  else throw new Error('Invalid scope reference')
}
/** Membership, qualification and recalculation belong to the backend. */
export function createScopes(port: ScopesPort) {
  return Object.freeze({
    list: (query: DirectoryQuery<keyof ScopeRow> = {}) => port.list(query),
    async read(id: string) {
      const value = await port.read(uuid(id))
      if (value.id !== id) throw new Error('Wrong scope detail')
      return value
    },
    async preview(request: ScopePreviewRequest) {
      validateDefinition(request.definition)
      if (!['agent', 'mdm'].includes(request.channel)) throw new Error('Invalid preview channel')
      if (request.editing) {
        uuid(request.editing.scopeId)
        if (
          !Number.isSafeInteger(request.editing.expectedRevision) ||
          request.editing.expectedRevision < 1
        )
          throw new Error('Invalid preview revision')
      }
      const value = await port.preview(freeze(request))
      if (
        value.channel !== request.channel ||
        value.items.length > 1000 ||
        value.scanComplete !== (value.stopReason === 'complete')
      )
        throw new Error('Wrong scope preview')
      return value
    },
    references: (id: string, query: WindowQuery = {}) => port.references(uuid(id), query),
    async change(id: string, change: Operation<ScopeChange>) {
      uuid(id)
      operation(change)
      if (change.input.action === 'put') validateDefinition(change.input.definition)
      else if (
        !['delete', 'recompute'].includes(change.input.action) ||
        change.expectedRevision === 0
      )
        throw new Error('Invalid scope deletion')
      const value = await port.change(id, freeze(change))
      if (
        value.id !== id ||
        value.revision !==
          change.expectedRevision + (change.input.action === 'recompute' ? 0 : 1) ||
        (change.input.action === 'recompute' && !value.task)
      )
        throw new Error('Wrong scope receipt')
      return value
    },
    async task(id: string, task: string) {
      const value = await port.task(uuid(id), uuid(task))
      if (value.target !== id || value.task !== task || value.kind !== 'scope')
        throw new Error('Wrong scope task')
      return value
    },
    async result(
      id: string,
      result: string,
      kind: ScopeResultKind,
      channel: Channel,
      query: WindowQuery = {},
    ) {
      if (!['members', 'decisions'].includes(kind) || !['agent', 'mdm'].includes(channel))
        throw new Error('Invalid scope result selection')
      const value = await port.result(uuid(id), uuid(result), kind, channel, query)
      if (
        value.scope !== id ||
        value.result !== result ||
        value.channel !== channel ||
        value.page.kind !== kind
      )
        throw new Error('Wrong scope result coordinates')
      return value
    },
  })
}
