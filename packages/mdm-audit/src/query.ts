import { identifier, revision, uuid } from '@rss/mdm-inventory'
import type { WindowQuery } from '@rss/mdm-devices'
import type { ActivityQuery, AuditQuery, PolicyAddress } from './model'

export function validateWindow(
  query: WindowQuery & { readonly from?: number | undefined; readonly until?: number | undefined },
): void {
  if (
    query.limit !== undefined &&
    (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 200)
  )
    throw new Error('Invalid audit page size')
  if (query.cursor !== undefined && !query.cursor) throw new Error('Invalid audit cursor')
  if (query.from !== undefined) revision(query.from)
  if (query.until !== undefined) revision(query.until)
  if (query.from !== undefined && query.until !== undefined && query.from >= query.until)
    throw new Error('Invalid recorded time window')
}
export function validateAuditQuery(query: AuditQuery): void {
  validateWindow(query)
  for (const value of [query.targetId, query.targetType, query.device, query.actor, query.action])
    if (value !== undefined) identifier(value, 256)
  if (query.operationId !== undefined) uuid(query.operationId)
  if (query.requestId !== undefined) uuid(query.requestId)
  if (query.cursor !== undefined && query.cursor.length > 4096)
    throw new Error('Invalid audit cursor')
  if (
    query.outcome !== undefined &&
    !['succeeded', 'denied', 'failed', 'unknown'].includes(query.outcome)
  )
    throw new Error('Invalid audit outcome')
}
export function validateActivityQuery(query: ActivityQuery): void {
  validateWindow(query)
  for (const value of [query.source, query.kind, query.status, query.related])
    if (value !== undefined) identifier(value, 256)
  for (const value of [query.policy, query.request, query.batch, query.task, query.operation])
    if (value !== undefined) uuid(value)
}
export function validatePolicyAddress(address: PolicyAddress): void {
  if (address.kind === 'id') uuid(address.id)
  else if (address.kind === 'tool_name') identifier(address.name, 256)
  else if (address.kind === 'alias') {
    identifier(address.alias, 64)
    if (!/^[A-Za-z0-9._-]+$/.test(address.alias)) throw new Error('Invalid policy alias')
  } else throw new Error('Invalid policy address')
}
