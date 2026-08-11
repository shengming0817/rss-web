import type { ConfigCatalogPreviewRow, ConfigHistoryPreviewRow } from '@rss/settings/preview'
import { isConfigCatalogPreviewRow, isConfigHistoryPreviewRow } from '@rss/settings/preview-guard'

export type ConfigPreviewDraft =
  | Readonly<{ kind: 'catalog-key'; key: string }>
  | Readonly<{ kind: 'history-rollback'; key: string; toVersion: number }>

export interface ConfigPreviewDraftHandoff {
  stageCatalog(row: ConfigCatalogPreviewRow): boolean
  stageHistory(row: ConfigHistoryPreviewRow): boolean
  consume(): ConfigPreviewDraft | undefined
  discard(): void
}

export function createConfigPreviewDraftHandoff(): ConfigPreviewDraftHandoff {
  let staged: ConfigPreviewDraft | undefined
  return Object.freeze({
    stageCatalog(row: ConfigCatalogPreviewRow) {
      if (!isConfigCatalogPreviewRow(row)) return false
      staged = Object.freeze({ kind: 'catalog-key', key: row.key })
      return true
    },
    stageHistory(row: ConfigHistoryPreviewRow) {
      if (!isConfigHistoryPreviewRow(row)) return false
      staged = Object.freeze({
        kind: 'history-rollback',
        key: row.key,
        toVersion: row.version,
      })
      return true
    },
    consume() {
      const draft = staged
      staged = undefined
      return draft
    },
    discard() {
      staged = undefined
    },
  })
}
