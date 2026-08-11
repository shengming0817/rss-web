import { MOCK_SOURCE } from '@rss/shared'
import { CONFIG_CATALOG_PREVIEW_ROWS, type ConfigCatalogPreviewRow } from '../catalog/preview'

const CONFIG_HISTORY_PREVIEW_ROW: unique symbol = Symbol('rss-config-history-preview-row')

export interface ConfigHistoryPreviewRow {
  readonly [CONFIG_HISTORY_PREVIEW_ROW]: true
  readonly key: string
  readonly version: number
  readonly source: typeof MOCK_SOURCE
}

function row(catalogRow: ConfigCatalogPreviewRow, version: number): ConfigHistoryPreviewRow {
  return Object.freeze({
    [CONFIG_HISTORY_PREVIEW_ROW]: true as const,
    key: catalogRow.key,
    version,
    source: MOCK_SOURCE,
  })
}

export const CONFIG_HISTORY_PREVIEW_ROWS: readonly ConfigHistoryPreviewRow[] = Object.freeze([
  row(CONFIG_CATALOG_PREVIEW_ROWS[0]!, 3),
  row(CONFIG_CATALOG_PREVIEW_ROWS[0]!, 1),
  row(CONFIG_CATALOG_PREVIEW_ROWS[1]!, 4),
  row(CONFIG_CATALOG_PREVIEW_ROWS[1]!, 2),
  row(CONFIG_CATALOG_PREVIEW_ROWS[2]!, 5),
  row(CONFIG_CATALOG_PREVIEW_ROWS[2]!, 1),
  row(CONFIG_CATALOG_PREVIEW_ROWS[3]!, 2),
  row(CONFIG_CATALOG_PREVIEW_ROWS[3]!, 1),
])
