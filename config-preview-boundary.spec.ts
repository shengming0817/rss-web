import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname)
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('Config Preview boundary', () => {
  it('keeps every concrete fixture free of transport and provider seams', () => {
    const forbidden = /Provider|HttpTransport|SettingsApi|fetch\(|axios|cursor|fallback/i
    for (const path of [
      'packages/settings/src/catalog/preview.ts',
      'packages/settings/src/history/preview.ts',
    ]) {
      const preview = read(path)
      expect(preview).toContain('MOCK_SOURCE')
      expect(preview).not.toMatch(forbidden)
    }
    expect(read('packages/settings/src/index.ts')).not.toContain('preview')
  })

  it('uses one closed mode owner, exact flags, and a memory-only coordinate handoff', () => {
    const bootstrap = read('apps/web/src/bootstrap.ts')
    const catalogGate = read('apps/web/src/features/settings/config-catalog-preview.ts')
    const historyGate = read('apps/web/src/features/settings/config-history-preview.ts')
    const enablement = read('apps/web/src/features/settings/config-preview-enablement.ts')
    const handoff = read('apps/web/src/features/settings/config-preview-draft-context.ts')
    expect(bootstrap.match(/VITE_CONFIG_CATALOG_PREVIEW/g)).toHaveLength(1)
    expect(bootstrap.match(/VITE_CONFIG_HISTORY_PREVIEW/g)).toHaveLength(1)
    expect(enablement).toContain("['development', 'test', 'demo']")
    expect(catalogGate).toContain('isConfigPreviewEnabled')
    expect(historyGate).toContain('isConfigPreviewEnabled')
    expect(handoff).not.toMatch(/localStorage|sessionStorage|indexedDB|route\.query|history\.state/)
    expect(handoff).not.toMatch(/\bvalue\b|tenant|authorization|SettingsApi|HttpTransport/)

    const artifactGate = read('scripts/check-built-preview.mjs')
    expect(artifactGate).toContain('ConfigCatalogPreviewView')
    expect(artifactGate).toContain('ConfigHistoryPreviewView')
    expect(artifactGate).toContain('preview\\/config-catalog')
    expect(artifactGate).toContain('preview\\/config-history')
    expect(read('.github/workflows/test.yml')).toContain('pnpm build:preview:demo')
  })
})
