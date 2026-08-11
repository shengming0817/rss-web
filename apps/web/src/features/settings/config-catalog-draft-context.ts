import { CONFIG_CATALOG_PREVIEW_ROWS, type ConfigCatalogPreviewRow } from '@rss/settings/preview'

export interface ConfigCatalogDraftHandoff {
  stage(row: ConfigCatalogPreviewRow): boolean
  consume(): { readonly key: string } | undefined
}

export function createConfigCatalogDraftHandoff(): ConfigCatalogDraftHandoff {
  let staged: string | undefined
  return Object.freeze({
    stage(row: ConfigCatalogPreviewRow) {
      if (!CONFIG_CATALOG_PREVIEW_ROWS.includes(row)) return false
      staged = row.key
      return true
    },
    consume() {
      const key = staged
      staged = undefined
      return key === undefined ? undefined : Object.freeze({ key })
    },
  })
}
