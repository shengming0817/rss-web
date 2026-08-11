import {
  CONFIG_CATALOG_PREVIEW_ROWS,
  CONFIG_HISTORY_PREVIEW_ROWS,
  type ConfigCatalogPreviewRow,
  type ConfigHistoryPreviewRow,
} from '@rss/settings/preview'

export type ConfigPreviewDraft =
  | Readonly<{ kind: 'catalog-key'; key: string }>
  | Readonly<{ kind: 'history-rollback'; key: string; toVersion: number }>

export interface ConfigPreviewDraftHandoff {
  stageCatalog(row: ConfigCatalogPreviewRow): boolean
  stageHistory(row: ConfigHistoryPreviewRow): boolean
  consume(): ConfigPreviewDraft | undefined
}

export function createConfigPreviewDraftHandoff(): ConfigPreviewDraftHandoff {
  let staged: ConfigPreviewDraft | undefined
  return Object.freeze({
    stageCatalog(row: ConfigCatalogPreviewRow) {
      if (!CONFIG_CATALOG_PREVIEW_ROWS.includes(row)) return false
      staged = Object.freeze({ kind: 'catalog-key', key: row.key })
      return true
    },
    stageHistory(row: ConfigHistoryPreviewRow) {
      if (!CONFIG_HISTORY_PREVIEW_ROWS.includes(row)) return false
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
  })
}
