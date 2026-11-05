export type * from './model'
import type { DirectoryQuery } from '@rss/mdm-devices'
import type { Operation } from '@rss/mdm-inventory'
import {
  freeze,
  identifier,
  operation,
  revision,
  uuid,
  validateContext,
  validateCriteria,
} from '@rss/mdm-inventory'
import type { CompliancePort, Definition, HistoryQuery, RuleRow } from './model'

export function validateDefinition(value: Definition): void {
  const name = value.presentation['name']
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    [...name].length > 128 ||
    /\p{Cc}/u.test(name) ||
    new TextEncoder().encode(JSON.stringify(value)).length > 65536
  )
    throw new Error('Invalid compliance definition')
  let nodes = 0
  function visit(node: unknown, depth: number): void {
    if (++nodes > 4096 || depth > 16) throw new Error('Presentation exceeds budget')
    if (typeof node === 'number' && !Number.isFinite(node))
      throw new Error('Invalid presentation number')
    if (node && typeof node === 'object')
      for (const [key, child] of Object.entries(node)) {
        if (new TextEncoder().encode(key).length > 256 || /\p{Cc}/u.test(key))
          throw new Error('Invalid presentation key')
        visit(child, depth + 1)
      }
  }
  visit(value.presentation, 0)
  validateContext(value.criteria)
  validateCriteria(value.criteria.criteria)
  if (value.target.kind === 'groups') {
    if (
      !value.target.ids.length ||
      value.target.ids.length > 16 ||
      new Set(value.target.ids).size !== value.target.ids.length
    )
      throw new Error('Invalid compliance groups')
    value.target.ids.forEach(uuid)
  }
}
function emptyOperation(value: Operation<Record<string, never>>): void {
  operation(value)
  if (value.expectedRevision === 0 || Object.keys(value.input).length)
    throw new Error('Existing rule revision required')
}
/** Read facts and submit explicit immutable commands; never compute a compliance conclusion. */
export function createCompliance(port: CompliancePort) {
  return Object.freeze({
    list: (query: DirectoryQuery<keyof RuleRow> = {}) => port.list(query),
    async read(id: string) {
      const result = await port.read(uuid(id))
      if (result.id !== id) throw new Error('Wrong compliance rule')
      return result
    },
    async version(id: string, version: number) {
      uuid(id)
      if (!revision(version)) throw new Error('Invalid rule version')
      const result = await port.version(id, version)
      if (result.id !== id || result.revision !== version)
        throw new Error('Wrong compliance version')
      return result
    },
    async put(id: string, change: Operation<Definition>) {
      uuid(id)
      operation(change)
      validateDefinition(change.input)
      const result = await port.put(id, freeze(change))
      if (
        result.id !== id ||
        result.revision !== change.expectedRevision + 1 ||
        (change.input.enabled && !result.task)
      )
        throw new Error('Wrong compliance receipt')
      if (result.task) uuid(result.task)
      return result
    },
    async remove(id: string, change: Operation<Record<string, never>>) {
      uuid(id)
      emptyOperation(change)
      const result = await port.remove(id, freeze(change))
      if (result.id !== id || result.revision !== change.expectedRevision + 1 || !result.deleted)
        throw new Error('Wrong compliance deletion receipt')
      return result
    },
    async recompute(id: string, change: Operation<Record<string, never>>) {
      uuid(id)
      emptyOperation(change)
      const result = await port.recompute(id, freeze(change))
      uuid(result.task)
      return result
    },
    async task(id: string, task: string) {
      const result = await port.task(uuid(id), uuid(task))
      if (result.ruleId !== id || result.task !== task) throw new Error('Wrong compliance task')
      return result
    },
    async current(device: string) {
      const result = await port.current(identifier(device))
      if (result.device !== device) throw new Error('Wrong compliance device')
      for (const rule of result.rules) {
        if (rule.status === 'pending' && rule.current !== null)
          throw new Error('Pending compliance contains a current assessment')
        if (
          rule.current &&
          (rule.current.ruleId !== rule.ruleId || rule.current.ruleVersion !== rule.ruleVersion)
        )
          throw new Error('Wrong current assessment')
      }
      return result
    },
    history: (device: string, query: HistoryQuery = {}) => {
      identifier(device)
      for (const bound of [query.from, query.until])
        if (bound !== undefined && !Number.isSafeInteger(bound))
          throw new Error('Invalid history time')
      if (query.from !== undefined && query.until !== undefined && query.from > query.until)
        throw new Error('Invalid history range')
      return port.history(device, query)
    },
  })
}
