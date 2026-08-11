import { MOCK_SOURCE } from '@rss/shared'

export interface ConfigCatalogPreviewRow {
  readonly key: string
  readonly label: string
  readonly source: typeof MOCK_SOURCE
}

export interface ConfigCatalogPreviewQuery {
  readonly search?: string
  readonly prefix?: string
  readonly page?: number
}

export interface ConfigCatalogPreviewPage {
  readonly rows: readonly ConfigCatalogPreviewRow[]
  readonly page: number
  readonly hasMore: boolean
}

const PAGE_SIZE = 2

function row(key: string, label: string): ConfigCatalogPreviewRow {
  return Object.freeze({ key, label, source: MOCK_SOURCE })
}

export const CONFIG_CATALOG_PREVIEW_ROWS: readonly ConfigCatalogPreviewRow[] = Object.freeze([
  row('preview.example.appearance.theme', 'Synthetic appearance preference'),
  row('preview.example.notifications.digest', 'Synthetic digest preference'),
  row('preview.example.features.banner', 'Synthetic banner preference'),
  row('preview.example.reader.density', 'Synthetic reader preference'),
])

export function queryConfigCatalogPreview(
  input: ConfigCatalogPreviewQuery = {},
): ConfigCatalogPreviewPage {
  const page = Number.isSafeInteger(input.page) && (input.page ?? 0) > 0 ? input.page! : 1
  const search = input.search?.trim().toLocaleLowerCase() ?? ''
  const prefix = input.prefix?.trim() ?? ''
  const filtered = CONFIG_CATALOG_PREVIEW_ROWS.filter(
    (candidate) =>
      (search.length === 0 ||
        candidate.key.toLocaleLowerCase().includes(search) ||
        candidate.label.toLocaleLowerCase().includes(search)) &&
      (prefix.length === 0 || candidate.key.startsWith(prefix)),
  )
  const start = (page - 1) * PAGE_SIZE
  return Object.freeze({
    rows: Object.freeze(filtered.slice(start, start + PAGE_SIZE)),
    page,
    hasMore: start + PAGE_SIZE < filtered.length,
  })
}
