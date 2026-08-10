import type { AuditEntriesPage, AuditEntry } from './types'
import { decodeCursorPage } from '@rss/api'

function invalid(): never {
  throw new Error('invalid audit entries response')
}

function record(value: unknown, required: readonly string[], optional: readonly string[] = []) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid()
  const result = value as Record<string, unknown>
  if (required.some((key) => !Object.hasOwn(result, key))) invalid()
  if (Object.keys(result).some((key) => !required.includes(key) && !optional.includes(key)))
    invalid()
  return result
}

function text(value: unknown): string {
  if (typeof value !== 'string') invalid()
  return value
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) invalid()
  return value
}

function decodeAuditEntry(value: unknown): AuditEntry {
  const item = record(value, [
    'seq',
    'tenantId',
    'actor',
    'actorKind',
    'action',
    'resourceKind',
    'resourceId',
    'outcome',
    'recordedAt',
    'entryHash',
  ])
  return {
    seq: integer(item.seq),
    tenantId: text(item.tenantId),
    actor: text(item.actor),
    actorKind: text(item.actorKind),
    action: text(item.action),
    resourceKind: text(item.resourceKind),
    resourceId: text(item.resourceId),
    outcome: text(item.outcome),
    recordedAt: integer(item.recordedAt),
    entryHash: text(item.entryHash),
  }
}

export function decodeAuditEntriesPage(value: unknown): AuditEntriesPage {
  try {
    return decodeCursorPage(decodeAuditEntry)(value)
  } catch {
    return invalid()
  }
}
