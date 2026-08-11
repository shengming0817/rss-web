import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname)
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const gate = resolve(root, 'scripts/check-built-preview.mjs')
const temporary: string[] = []

function artifact(files: Readonly<Record<string, string>>): string {
  const directory = mkdtempSync(join(tmpdir(), 'rss-web-artifact-'))
  temporary.push(directory)
  for (const [name, content] of Object.entries(files)) {
    const target = join(directory, name)
    mkdirSync(resolve(target, '..'), { recursive: true })
    writeFileSync(target, content)
  }
  return directory
}

function scan(directory: string, mode: 'production' | 'demo') {
  return spawnSync(process.execPath, [gate, directory, mode], { encoding: 'utf8' })
}

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true })
})

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
    const demoBuild = JSON.parse(read('package.json')).scripts['build:preview:demo'] as string
    expect(demoBuild).toContain('VITE_ROLE_BINDINGS_PREVIEW=true')
    expect(demoBuild).toContain('VITE_CONFIG_CATALOG_PREVIEW=true')
    expect(demoBuild).toContain('VITE_CONFIG_HISTORY_PREVIEW=true')
    expect(demoBuild).toContain('check-built-preview.mjs apps/web/dist-preview-demo demo')
  })
})

describe('built Preview artifact gate', () => {
  it('rejects every Preview family from production artifacts', () => {
    for (const marker of [
      'RoleBindingsPreviewView',
      'preview/role-bindings',
      'preview-subject-alpha',
      'ConfigCatalogPreviewView',
      'ConfigHistoryPreviewView',
    ]) {
      const result = scan(artifact({ 'assets/index-deadbeef.js': marker }), 'production')
      expect(result.status, marker).not.toBe(0)
    }
  })

  it('allows explicitly enabled Preview code in demo artifacts', () => {
    const result = scan(
      artifact({
        'index.html': '<script type="module" src="/assets/index-deadbeef.js"></script>',
        'assets/index-deadbeef.js':
          'RoleBindingsPreviewView ConfigCatalogPreviewView ConfigHistoryPreviewView',
      }),
      'demo',
    )
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })

  it.each([
    ['an inline script', '<script>window.inline = true</script>'],
    ['an inline script with data-src', '<script data-src="/ignored.js">inline()</script>'],
    ['an inline script with x-src', '<script x-src="/ignored.js">inline()</script>'],
    ['an external font', '<link href="https://fonts.googleapis.com/css2?family=Geist">'],
    ['a protocol-relative external font', 'url(//fonts.gstatic.com/font.woff2)'],
    ['an HTTP external font', '@import "http://fonts.googleapis.com/css"'],
    ['the removed Ant runtime', 'ant-design-vue'],
  ])('rejects %s from both production and demo artifacts', (_label, marker) => {
    for (const mode of ['production', 'demo'] as const) {
      const result = scan(artifact({ 'index.html': marker }), mode)
      expect(result.status, mode).not.toBe(0)
    }
  })

  it('keeps the source index and runtime manifests self-contained and Ant-free', () => {
    const index = read('apps/web/index.html')
    const app = read('apps/web/src/App.vue')
    const main = read('apps/web/src/main.ts')
    const themeInit = read('apps/web/public/theme-init.js')
    const webManifest = read('apps/web/package.json')
    const coreManifest = read('packages/core/package.json')

    expect(scan(artifact({ 'index.html': index }), 'production').status).toBe(0)
    expect(index).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com|https?:\/\//)
    expect(index).toContain('<script src="/theme-init.js"></script>')
    expect(index).not.toMatch(/theme-init\.js[^>]*(?:async|defer|type=)/)
    expect(themeInit).toContain("localStorage.getItem('rss-theme')")
    expect(themeInit).toContain("matchMedia('(prefers-color-scheme: dark)')")
    expect(themeInit).toContain('document.documentElement.dataset.theme = theme')
    expect(
      [app, main, webManifest, coreManifest, read('pnpm-workspace.yaml')].join('\n'),
    ).not.toMatch(/ant-design-vue|@ant-design\/icons-vue|useThemeTokens|ConfigProvider/)
  })
})
