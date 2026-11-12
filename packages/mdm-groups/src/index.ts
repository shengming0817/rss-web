export type * from './model'
import type { DeviceRef, WindowQuery } from '@rss/mdm-devices'
import type { Operation } from '@rss/mdm-inventory'
import {
  freeze,
  operation,
  reference,
  uuid,
  validateContext,
  validateCriteria,
} from '@rss/mdm-inventory'
import type {
  GroupChange,
  GroupPreviewRequest,
  GroupCondition,
  GroupCriteria,
  GroupQuery,
  GroupsPort,
  ReferenceQuery,
  ImpactQuery,
  ResultKind,
} from './model'

export function validatePresentation(value: Readonly<Record<string, unknown>>): void {
  const name = value['name']
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    [...name].length > 128 ||
    new TextEncoder().encode(JSON.stringify(value)).length > 65536
  )
    throw new Error('Invalid group presentation')
  let nodes = 0
  function visit(node: unknown, depth: number): void {
    if (++nodes > 4096 || depth > 16) throw new Error('Presentation exceeds budget')
    if (typeof node === 'number' && !Number.isFinite(node))
      throw new Error('Invalid presentation number')
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        if (new TextEncoder().encode(key).length > 256 || /\p{Cc}/u.test(key))
          throw new Error('Invalid presentation key')
        visit(child, depth + 1)
      }
    }
  }
  visit(value, 0)
}
export function validateRule(value: GroupCondition): void {
  validateContext(value)
  let nodes = 0
  function visit(node: GroupCriteria, depth: number) {
    if (++nodes > 4096 || depth > 16) throw new Error('Group condition exceeds authoring budget')
    if (node.kind === 'group') uuid(node.groupId)
    else if (node.kind === 'predicate') validateCriteria(node)
    else node.children.forEach((child) => visit(child, depth + 1))
  }
  visit(value.criteria, 0)
}
function endpoints(items: readonly DeviceRef[]): void {
  const seen = new Set<string>()
  for (const item of items) {
    reference(item)
    if (item.kind !== 'endpoint' || seen.has(item.id))
      throw new Error('Static groups require distinct endpoints')
    seen.add(item.id)
  }
}
export function validateChange(change: Operation<GroupChange>): void {
  operation(change)
  const input = change.input
  if (input.action === 'create') {
    if (
      change.expectedRevision !== 0 ||
      (input.criteria === null && input.assetContext !== 'endpoint')
    )
      throw new Error('Invalid group creation context')
    validatePresentation(input.presentation)
    if (input.criteria) validateRule(input.criteria)
  } else {
    if (change.expectedRevision === 0) throw new Error('Existing group revision required')
    if (input.action === 'edit') validatePresentation(input.presentation)
    if (input.action === 'rule') validateRule(input.criteria)
    if (input.action === 'members') {
      endpoints(input.add)
      endpoints(input.remove)
      const added = new Set(input.add.map((item) => item.id))
      if (input.remove.some((item) => added.has(item.id)))
        throw new Error('Conflicting member edit')
    }
  }
}
/** Group computation and cycle admission stay with the server; a preview never publishes members. */
export function createGroups(port: GroupsPort) {
  return Object.freeze({
    list: (query: GroupQuery = {}, signal?: AbortSignal) => port.list(query, signal),
    async read(id: string) {
      const result = await port.read(uuid(id))
      if (result.group.id !== id) throw new Error('Wrong group detail')
      return result
    },
    async change(id: string, change: Operation<GroupChange>) {
      uuid(id)
      validateChange(change)
      const result = await port.change(id, freeze(change))
      if ('statusUrl' in result) {
        uuid(result.task)
        if (result.target !== id) throw new Error('Wrong group task receipt')
      } else if (result.operation !== change.operationId || result.group.id !== id)
        throw new Error('Wrong group change receipt')
      return result
    },
    async preview(request: GroupPreviewRequest) {
      validateRule(request.criteria)
      if (!['endpoint', 'associated_device'].includes(request.assetContext))
        throw new Error('Invalid asset context')
      if (request.editing) {
        uuid(request.editing.groupId)
        if (
          !Number.isSafeInteger(request.editing.expectedRevision) ||
          request.editing.expectedRevision < 1
        )
          throw new Error('Invalid preview revision')
      }
      const result = await port.preview(freeze(request))
      if (
        result.items.length > 1000 ||
        result.items.some(
          (item) =>
            item.kind !== (request.assetContext === 'endpoint' ? 'endpoint' : 'association'),
        )
      )
        throw new Error('Wrong preview sample')
      return result
    },
    async task(id: string, task: string) {
      const result = await port.task(uuid(id), uuid(task))
      if (result.task !== task || result.target !== id) throw new Error('Wrong group task')
      return result
    },
    async result(id: string, resultId: string, kind: ResultKind, query: WindowQuery = {}) {
      const result = await port.result(uuid(id), uuid(resultId), kind, query)
      if (result.group !== id || result.result !== resultId || result.page.kind !== kind)
        throw new Error('Wrong group result')
      return result
    },
    references: (id: string, query: ReferenceQuery = {}) => port.references(uuid(id), query),
    impacts: (id: string, query: ImpactQuery = {}) => port.impacts(uuid(id), query),
  })
}
