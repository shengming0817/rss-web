import { MOCK_SOURCE } from '@rss/shared'
import type { ConfigCatalogDraftHandoff } from './config-catalog-draft-context'

declare const handoff: ConfigCatalogDraftHandoff

// @ts-expect-error only a sealed fixture row may cross the handoff
handoff.stage('production.database.password')

// @ts-expect-error same-shaped Mock metadata cannot forge a sealed fixture row
handoff.stage({ key: 'production.database.password', label: 'forged', source: MOCK_SOURCE })
