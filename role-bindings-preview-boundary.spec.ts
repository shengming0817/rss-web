import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = import.meta.dirname
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('Role Bindings Preview boundary', () => {
  const fixture = 'apps/web/src/features/identity/role-bindings-preview.ts'
  const view = 'apps/web/src/features/identity/RoleBindingsPreviewView.vue'

  it('keeps the Preview app-local, read-only, and detached from real authority owners', () => {
    const production = [read(fixture), read(view)].join('\n')
    expect(production).not.toMatch(
      /roles-context|role-binding-operation|@rss\/api|@rss\/authorization|session-context/,
    )
    expect(production).not.toMatch(
      /\b(?:fetch|request|execute|assign|revoke|receipt|history|provider)\b|localStorage|sessionStorage|jwt|X-Tenant-ID/i,
    )
  })

  it('has one reviewed environment composition owner and no package-level Preview model', () => {
    const bootstrap = read('apps/web/src/bootstrap.ts')
    const router = read('apps/web/src/router/index.ts')
    const enablement = read('apps/web/src/features/identity/role-bindings-preview-enablement.ts')
    expect(bootstrap.match(/VITE_ROLE_BINDINGS_PREVIEW/g)).toHaveLength(1)
    expect(bootstrap).not.toMatch(/WebRuntimeOptions|options\?\.roleBindingsPreview/)
    expect(bootstrap).toMatch(
      /isRoleBindingsPreviewEnabled\(import\.meta\.env\.MODE, import\.meta\.env\.VITE_ROLE_BINDINGS_PREVIEW\)/,
    )
    expect(bootstrap).toMatch(
      /import\.meta\.env\.MODE !== 'production'\s*&&\s*isRoleBindingsPreviewEnabled/,
    )
    expect(enablement).toContain("['development', 'test', 'demo']")
    expect(router).toContain(
      "if (import.meta.env.MODE !== 'production' && options.roleBindingsPreview)",
    )
    expect(router).toContain('source: MOCK_SOURCE')
    expect(router).not.toContain('authorizationIntent: ROLE_BINDINGS')
    expect(read('packages/identity/src/index.ts')).not.toMatch(
      /RoleBindingsPreview|BindingsProvider/,
    )
    expect(read('packages/authorization/src/index.ts')).not.toMatch(/RoleBindings|BindingsProvider/)
  })
})
