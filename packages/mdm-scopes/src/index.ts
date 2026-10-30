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
    async change(id: string, change: Operation<ScopeChange>) {
      uuid(id)
      operation(change)
      if (change.input.action === 'put') validateDefinition(change.input.definition)
      else if (change.input.action !== 'delete' || change.expectedRevision === 0)
        throw new Error('Invalid scope deletion')
      const value = await port.change(id, freeze(change))
      if (value.id !== id || value.revision !== change.expectedRevision + 1)
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
