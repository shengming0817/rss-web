import type { ConfigCatalogPreviewRow } from '@rss/settings/preview'

export interface ConfigCatalogDraftHandoff {
  stage(row: ConfigCatalogPreviewRow): void
  consume(): { readonly key: string } | undefined
}

export function createConfigCatalogDraftHandoff(): ConfigCatalogDraftHandoff {
  let staged: string | undefined
  return Object.freeze({
    stage(row: ConfigCatalogPreviewRow) {
      staged = row.key
    },
    consume() {
      const key = staged
      staged = undefined
      return key === undefined ? undefined : Object.freeze({ key })
    },
  })
}
