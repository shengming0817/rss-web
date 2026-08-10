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

export interface AuditEntriesPage {
  readonly data: readonly AuditEntry[]
  readonly hasMore: boolean
  readonly nextCursor?: string
}

export interface ListAuditEntriesOptions {
  readonly limit?: number
  readonly cursor?: string
  readonly signal?: AbortSignal
}
