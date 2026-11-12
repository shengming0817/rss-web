export type * from './model'
import type { Channel, WindowQuery } from '@rss/mdm-devices'
import { freeze, identifier, uuid } from '@rss/mdm-inventory'
import type { ScopeDefinition, ScopeReference, ScopeResultKind, ScopeOwner, ScopePreviewRequest, ScopesPort } from './model'

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
function validateOwner(owner: ScopeOwner) {
  uuid(owner.policyId)
  if (owner.stageId !== undefined) uuid(owner.stageId)
}
/** Policy owns configuration; Scope keeps read, preview and computation coordinates. */
export function createScopes(port: ScopesPort) {
  return Object.freeze({
    async read(owner: ScopeOwner, signal?: AbortSignal) {
      validateOwner(owner)
      const value = await port.read(owner, signal)
      if (value.stage !== (owner.stageId ?? null)) throw new Error('Wrong scope owner')
      return value
    },
    async preview(owner: ScopeOwner, request: ScopePreviewRequest, signal?: AbortSignal) {
      validateOwner(owner)
      validateDefinition(request.definition)
      if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0 || !['agent', 'mdm'].includes(request.channel))
        throw new Error('Invalid scope preview')
      const value = await port.preview(owner, freeze(request), signal)
      if (value.channel !== request.channel || value.items.length > 1000 || value.scanComplete !== (value.stopReason === 'complete'))
        throw new Error('Wrong scope preview')
      return value
    },
    async recompute(owner: ScopeOwner, request: { readonly operationId: string; readonly expectedRevision: number }) {
      validateOwner(owner)
      uuid(request.operationId)
      if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 1) throw new Error('Invalid policy revision')
      const value = await port.recompute(owner, freeze(request))
      if (!value.task) throw new Error('Missing scope computation')
      return value
    },
    async task(owner: ScopeOwner, scope: string, task: string, signal?: AbortSignal) {
      validateOwner(owner)
      uuid(scope); uuid(task)
      const value = await port.task(owner, scope, task, signal)
      if (value.target !== scope || value.task !== task || value.kind !== 'scope') throw new Error('Wrong scope task')
      return value
    },
    async result(owner: ScopeOwner, scope: string, result: string, kind: ScopeResultKind, channel: Channel, query: WindowQuery = {}, signal?: AbortSignal) {
      validateOwner(owner)
      uuid(scope); uuid(result)
      if (!['members', 'decisions'].includes(kind) || !['agent', 'mdm'].includes(channel)) throw new Error('Invalid scope result selection')
      const value = await port.result(owner, scope, result, kind, channel, query, signal)
      if (value.scope !== scope || value.result !== result || value.channel !== channel || value.page.kind !== kind) throw new Error('Wrong scope result coordinates')
      return value
    },
  })
}
