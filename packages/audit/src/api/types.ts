import type { CursorPage } from '@rss/api'

export interface AuditEntry {
  readonly seq: number
  readonly tenantId: string
  readonly actor: string
  readonly actorKind: string
  readonly action: string
  readonly resourceKind: string
  readonly resourceId: string
  readonly outcome: string
  readonly recordedAt: number
  readonly entryHash: string
}

export type AuditEntriesPage = CursorPage<AuditEntry>

export interface ListAuditEntriesOptions {
  readonly limit?: number
  readonly cursor?: string
  readonly signal?: AbortSignal
}
