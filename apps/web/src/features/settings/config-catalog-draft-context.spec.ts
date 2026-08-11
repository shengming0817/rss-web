import { describe, expect, it } from 'vitest'
import { createConfigCatalogDraftHandoff } from './config-catalog-draft-context'

describe('Config Catalog draft handoff', () => {
  it('stages a reviewed synthetic key for one consumption only', () => {
    const handoff = createConfigCatalogDraftHandoff()
    expect(handoff.stage('preview.example.appearance.theme')).toBe(true)
    expect(handoff.consume()).toEqual({ key: 'preview.example.appearance.theme' })
    expect(handoff.consume()).toBeUndefined()
  })

  it('rejects arbitrary keys', () => {
    const handoff = createConfigCatalogDraftHandoff()
    expect(handoff.stage('production.database.password')).toBe(false)
    expect(handoff.consume()).toBeUndefined()
  })
})
