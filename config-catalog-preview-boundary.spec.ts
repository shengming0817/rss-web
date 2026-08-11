import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname)
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('Config Preview boundary', () => {
  it('keeps the concrete fixture free of transport and provider seams', () => {
    const preview = read('packages/settings/src/catalog/preview.ts')
    expect(preview).toContain('MOCK_SOURCE')
    expect(preview).not.toMatch(/Provider|HttpTransport|SettingsApi|fetch\(|axios|cursor|fallback/i)
    expect(read('packages/settings/src/index.ts')).not.toContain('preview')
  })

  it('uses one exact build-time gate and an in-memory key-only handoff', () => {
    const bootstrap = read('apps/web/src/bootstrap.ts')
    const handoff = read('apps/web/src/features/settings/config-preview-draft-context.ts')
    expect(bootstrap.match(/VITE_CONFIG_CATALOG_PREVIEW/g)).toHaveLength(1)
    expect(bootstrap.match(/VITE_CONFIG_HISTORY_PREVIEW/g)).toHaveLength(1)
    expect(handoff).not.toMatch(/localStorage|sessionStorage|indexedDB|route\.query|history\.state/)
    expect(handoff).not.toMatch(/\bvalue\b|tenant|authorization|SettingsApi|HttpTransport/)

    const artifactGate = read('scripts/check-built-preview.mjs')
    expect(artifactGate).toContain('ConfigCatalogPreviewView')
    expect(artifactGate).toContain('ConfigHistoryPreviewView')
    expect(artifactGate).toContain('preview\\/config-catalog')
    expect(artifactGate).toContain('preview\\/config-history')
  })
})
