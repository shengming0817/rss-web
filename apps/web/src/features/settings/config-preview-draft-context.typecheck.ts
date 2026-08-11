import { MOCK_SOURCE } from '@rss/shared'
import type { ConfigPreviewDraftHandoff } from './config-preview-draft-context'

declare const handoff: ConfigPreviewDraftHandoff

// @ts-expect-error only a sealed Catalog fixture may cross the handoff
handoff.stageCatalog('production.database.password')

// @ts-expect-error same-shaped Mock metadata cannot forge a sealed Catalog row
handoff.stageCatalog({ key: 'production.database.password', label: 'forged', source: MOCK_SOURCE })

// @ts-expect-error same-shaped Mock metadata cannot forge a sealed History row
handoff.stageHistory({ key: 'preview.example.appearance.theme', version: 1, source: MOCK_SOURCE })
