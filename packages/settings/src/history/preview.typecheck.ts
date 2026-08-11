import { MOCK_SOURCE } from '@rss/shared'
import type { ConfigHistoryPreviewRow } from './preview'

// @ts-expect-error Preview fixtures are not part of the authoritative package root
import { CONFIG_HISTORY_PREVIEW_ROWS as rootHistoryRows } from '../index'
void rootHistoryRows

// @ts-expect-error same-shaped metadata cannot forge the package-private row brand
const sameShape: ConfigHistoryPreviewRow = {
  key: 'preview.example.appearance.theme',
  version: 1,
  source: MOCK_SOURCE,
}
void sameShape

// @ts-expect-error unbranded production coordinates cannot enter a sealed Preview row
const productionCoordinate: ConfigHistoryPreviewRow = {
  key: 'production.database.password',
  version: 1,
  source: MOCK_SOURCE,
}
void productionCoordinate
