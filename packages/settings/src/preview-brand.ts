import type { ConfigCatalogPreviewRow } from './catalog/preview'
import type { ConfigHistoryPreviewRow } from './history/preview'

const catalogRows = new WeakSet<object>()
const historyRows = new WeakSet<object>()

export function registerConfigCatalogPreviewRow<T extends object>(row: T): T {
  catalogRows.add(row)
  return row
}

export function registerConfigHistoryPreviewRow<T extends object>(row: T): T {
  historyRows.add(row)
  return row
}

export function isConfigCatalogPreviewRow(value: unknown): value is ConfigCatalogPreviewRow {
  return typeof value === 'object' && value !== null && catalogRows.has(value)
}

export function isConfigHistoryPreviewRow(value: unknown): value is ConfigHistoryPreviewRow {
  return typeof value === 'object' && value !== null && historyRows.has(value)
}
