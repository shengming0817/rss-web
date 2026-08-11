import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname)
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const tracked = (path: string) =>
  execFileSync('/usr/bin/git', ['ls-files', '--', path], { cwd: root, encoding: 'utf8' }).trim()

const removed = [
  'packages/access',
  'packages/config',
  'packages/contracts',
  'packages/devboard',
  'packages/observability',
  'tools/cell-manifest',
  'tools/codegen',
]

describe('RSS-only foundation boundary', () => {
  it.each(removed)('does not track removed product surface: %s', (path) => {
    expect(tracked(path)).toBe('')
  })

  it('ships the reusable foundation and selected identity adapter', () => {
    for (const name of ['api', 'audit', 'authorization', 'core', 'identity', 'runtime', 'shared']) {
      expect(existsSync(resolve(root, 'packages', name, 'package.json'))).toBe(true)
    }
  })

  it('keeps one API seam without contract copies or the retired request package', () => {
    expect(tracked('packages/request')).toBe('')
    for (const path of [
      'packages/api/contracts',
      'packages/api/schemas',
      'packages/api/codegen',
      'packages/api/registry',
      'packages/identity/contracts',
      'packages/identity/schemas',
      'packages/identity/codegen',
      'packages/identity/registry',
      'packages/audit/contracts',
      'packages/audit/schemas',
      'packages/audit/codegen',
      'packages/audit/registry',
      'packages/runtime/contracts',
      'packages/runtime/schemas',
      'packages/runtime/codegen',
      'packages/runtime/registry',
    ]) {
      expect(tracked(path)).toBe('')
    }
  })

  it('keeps Axios and production API paths behind @rss/api', () => {
    let output = ''
    try {
      output = execFileSync(
        '/usr/bin/git',
        ['grep', '-n', '-E', 'from [\'"]axios[\'"]|[\'"]/api/', '--', 'apps', 'packages'],
        { cwd: root, encoding: 'utf8' },
      )
    } catch (error) {
      const status = (error as { status?: number }).status
      if (status !== 1) throw error
    }
    const violations = output
      .split('\n')
      .filter(Boolean)
      .filter((line) => !line.includes('.spec.ts:'))
      .filter((line) => !line.includes('.typecheck.ts:'))
      .filter((line) => !line.startsWith('packages/api/src/transport.ts:'))
      .filter((line) => !line.startsWith('packages/api/src/endpoints/identity.ts:'))
      .filter((line) => !line.startsWith('packages/api/src/endpoints/audit.ts:'))
      .filter((line) => !line.startsWith('packages/api/src/endpoints/runtime.ts:'))
      .filter((line) => !line.startsWith('packages/api/src/endpoints/settings.ts:'))
    expect(violations).toEqual([])
  })

  it('does not log Identity production data', () => {
    let output = ''
    try {
      output = execFileSync(
        '/usr/bin/git',
        ['grep', '-n', '-E', 'console\\.|logger\\.', '--', 'packages/identity/src'],
        { cwd: root, encoding: 'utf8' },
      )
    } catch (error) {
      const status = (error as { status?: number }).status
      if (status !== 1) throw error
    }
    const productionMatches = output
      .split('\n')
      .filter(Boolean)
      .filter((line) => !line.includes('.spec.ts:'))
    expect(productionMatches).toEqual([])
  })

  it('exposes only implemented production navigation with the protected catch-all', () => {
    const router = read('apps/web/src/router/index.ts')
    const runtimeIntent = read('apps/web/src/features/runtime/runtime-intent.ts')
    const auditIntent = read('apps/web/src/features/audit/audit-intent.ts')
    const policiesIntent = read('apps/web/src/features/identity/policies-intent.ts')
    const configIntent = read('apps/web/src/features/settings/config-intent.ts')
    const secretPublishIntent = read('apps/web/src/features/settings/secret-publish-intent.ts')
    const secretResolveIntent = read('apps/web/src/features/settings/secret-resolve-intent.ts')
    expect(router).toContain("path: '/'")
    expect(router).toContain("path: '/login'")
    expect(router).toContain("path: ':pathMatch(.*)*'")
    const labels = [...router.matchAll(/labelKey: '(navigation\.[^']+)'/g)].map((match) => match[1])
    expect(
      labels.filter(
        (label) =>
          label !== 'navigation.roleBindingsPreview' &&
          label !== 'navigation.configCatalogPreview' &&
          label !== 'navigation.configHistoryPreview',
      ),
    ).toEqual([
      'navigation.home',
      'navigation.identity',
      'navigation.accountStatus',
      'navigation.roles',
      'navigation.policies',
      'navigation.settings',
      'navigation.secretReference',
      'navigation.secretMaterial',
      'navigation.runtime',
      'navigation.audit',
    ])
    expect(labels.filter((label) => label === 'navigation.roleBindingsPreview')).toHaveLength(1)
    expect(labels.filter((label) => label === 'navigation.configCatalogPreview')).toHaveLength(1)
    expect(labels.filter((label) => label === 'navigation.configHistoryPreview')).toHaveLength(1)
    expect(router).toContain('if (options.roleBindingsPreview)')
    expect(router).toContain(
      "import.meta.env.MODE !== 'production' && options.configCatalogPreview",
    )
    expect(router).toContain(
      "import.meta.env.MODE !== 'production' && options.configHistoryPreview",
    )
    expect(router).toContain('source: MOCK_SOURCE')
    expect(router).toContain('authorizationIntent: RUNTIME_INVENTORY_INTENT')
    expect(runtimeIntent).toContain("contractId: 'runtime.inventory'")
    expect(runtimeIntent).toContain("permission: 'runtime:inventory:read'")
    expect(router).toContain('authorizationIntent: AUDIT_AMBIENT_INTENT')
    expect(auditIntent).toContain("contractId: 'audit.list-entries'")
    expect(auditIntent).toContain("contractId: 'audit.list-tenant-entries'")
    expect(auditIntent).toContain("permission: 'audit:read'")
    expect(router).toContain('authorizationIntent: POLICIES_LIST_INTENT')
    expect(policiesIntent).toContain("contractId: 'identity.policies-list'")
    expect(policiesIntent).toContain("contractId: 'identity.policies-get'")
    expect(policiesIntent).toContain("permission: 'identity:policy:read'")
    expect(policiesIntent).toContain("contractId: 'identity.policies-create'")
    expect(policiesIntent).toContain("permission: 'identity:policy:create'")
    expect(policiesIntent).toContain("contractId: 'identity.policies-update'")
    expect(policiesIntent).toContain("permission: 'identity:policy:update'")
    expect(policiesIntent).toContain("contractId: 'identity.policies-deactivate'")
    expect(policiesIntent).toContain("permission: 'identity:policy:deactivate'")
    expect(router).toContain('authorizationIntent: CONFIG_GET_INTENT')
    expect(configIntent).toContain("contractId: 'settings.config-get'")
    expect(configIntent).toContain("contractId: 'settings.config-publish'")
    expect(configIntent).toContain("contractId: 'settings.config-delete'")
    expect(configIntent).toContain("contractId: 'settings.config-rollback'")
    expect(router).toContain('authorizationIntent: SECRET_PUBLISH_INTENT')
    expect(secretPublishIntent).toContain("contractId: 'settings.secret-publish'")
    expect(secretPublishIntent).toContain("permission: 'settings.secret-publish'")
    expect(router).toContain('authorizationIntent: SECRET_RESOLVE_INTENT')
    expect(secretResolveIntent).toContain("contractId: 'settings.secret-resolve'")
    expect(secretResolveIntent).toContain("permission: 'settings.secret-resolve'")
    expect(router).not.toContain("path: 'config'")
    for (const path of ['/access', '/flags', '/admin', '/observability', '/observe']) {
      expect(router).not.toContain(path)
    }
  })

  it('has no production calls to historical backends', () => {
    let output = ''
    try {
      output = execFileSync(
        '/usr/bin/git',
        [
          'grep',
          '-n',
          '-E',
          '/api/v1/(access|config|admin|observability)|/internal/v1',
          '--',
          'apps',
          'packages',
        ],
        { cwd: root, encoding: 'utf8' },
      )
    } catch (error) {
      const status = (error as { status?: number }).status
      if (status !== 1) throw error
    }
    const productionMatches = output
      .split('\n')
      .filter(Boolean)
      .filter((line) => !line.includes('.spec.ts:'))
    expect(productionMatches).toEqual([])
  })

  it('does not retain historical authentication or PDP route contracts', () => {
    const forbidden = [
      '/api/v1/access/decide',
      'createPdpClient',
      'permissionMap',
      'requiresAuth',
      'requiredAction',
      'requiredResource',
      'PDP_INJECTION_KEY',
    ]
    for (const token of forbidden) {
      let output = ''
      try {
        output = execFileSync(
          '/usr/bin/git',
          ['grep', '-n', token, '--', 'apps/web/src', 'packages'],
          { cwd: root, encoding: 'utf8' },
        )
      } catch (error) {
        const status = (error as { status?: number }).status
        if (status !== 1) throw error
      }
      const productionMatches = output
        .split('\n')
        .filter(Boolean)
        .filter((line) => !line.includes('.spec.ts:'))
        .filter((line) => !line.includes('.typecheck.ts:'))
      expect(productionMatches).toEqual([])
    }

    expect(read('packages/core/vitest.config.ts')).not.toContain('src/pdp/')
  })

  it('does not retain obsolete workflows or package dependencies', () => {
    for (const workflow of [
      '.github/workflows/cell-manifest-diff.yml',
      '.github/workflows/codegen-diff.yml',
    ]) {
      expect(tracked(workflow)).toBe('')
    }
    const dependencies = JSON.parse(read('apps/web/package.json')).dependencies as Record<
      string,
      string
    >
    expect(
      Object.keys(dependencies).filter((name) =>
        removed.some((path) => name.endsWith(path.split('/').at(-1)!)),
      ),
    ).toEqual([])
  })

  it('keeps authoritative RSS source labels at reviewed production owners', () => {
    const candidates = execFileSync(
      '/usr/bin/git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'apps/web/src', 'packages'],
      { cwd: root, encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(Boolean)
      .filter((path) => existsSync(resolve(root, path)))
    const productionOwners = candidates
      .filter((path) => read(path).includes('RSS_SOURCE'))
      .filter((path) => !path.endsWith('.spec.ts'))
      .filter((path) => !path.endsWith('.typecheck.ts'))
      .filter((path) => path !== 'packages/shared/src/index.ts')
      .sort()
    expect(productionOwners).toEqual([
      'apps/web/src/features/audit/AuditEntriesView.vue',
      'apps/web/src/features/audit/HomeAuditEntries.vue',
      'apps/web/src/features/identity/AccountStatusView.vue',
      'apps/web/src/features/identity/IdentitySelfServiceView.vue',
      'apps/web/src/features/identity/PoliciesView.vue',
      'apps/web/src/features/identity/RolesView.vue',
      'apps/web/src/features/runtime/HomeRuntimeSummary.vue',
      'apps/web/src/features/runtime/RuntimeDetailsView.vue',
      'apps/web/src/features/settings/ConfigView.vue',
      'apps/web/src/features/settings/SecretMaterialRevealView.vue',
      'apps/web/src/features/settings/SecretPublishView.vue',
      'apps/web/src/router/index.ts',
    ])
  })

  it('keeps target-tenant Audit explicit, headerless, and non-replayable', () => {
    const client = read('packages/audit/src/api/client.ts')
    const page = read('apps/web/src/features/audit/AuditEntriesView.vue')
    const session = read('packages/api/src/session.ts')
    expect(client).toContain("session: 'required-no-replay'")
    expect(client).not.toContain('headers:')
    expect(page).toContain('audit.listTenantEntries')
    expect(page).not.toMatch(/profile\.kind|superAdmin|SuperAdmin/)
    expect(session).toContain("request.session === 'required-no-replay'")
    expect(session).toContain('hooks.invalidate(initial.generation)')
  })

  it('keeps Account Status explicit and removes the retired provider design', () => {
    const production = [
      read('packages/identity/src/account-status/client.ts'),
      read('apps/web/src/features/identity/AccountStatusView.vue'),
      read('apps/web/src/features/identity/account-status-operation.ts'),
    ].join('\n')
    expect(production).not.toMatch(
      /KnownSubjectProvider|subject-provider|SubjectPicker|account-status-resolver|mock.*account.*status/i,
    )
    expect(production).not.toMatch(/headers:|X-Tenant-ID|profile\.kind|superAdmin/i)
    expect(read('packages/identity/src/account-status/client.ts')).toContain("session: 'required'")
  })

  it('keeps Roles explicit, command-only, and non-replayable for assign', () => {
    const client = read('packages/identity/src/roles/client.ts')
    const page = read('apps/web/src/features/identity/RolesView.vue')
    const operation = read('apps/web/src/features/identity/role-binding-operation.ts')
    const production = [client, page, operation].join('\n')
    expect(client).toContain("session: 'required-no-replay'")
    expect(client).toContain("session: 'required'")
    expect(client).not.toContain('headers:')
    expect(production).not.toMatch(
      /KnownSubjectProvider|subject-provider|SubjectPicker|directory|bindingHistory|bindingMap|profile\.kind|superAdmin/i,
    )
    expect(operation).not.toMatch(/bindings|currentBinding|effectiveRole/)
  })

  it('keeps Policies server-authoritative and free of local ABAC evaluation', () => {
    const client = read('packages/identity/src/policies/client.ts')
    const page = read('apps/web/src/features/identity/PoliciesView.vue')
    const rules = read('apps/web/src/features/identity/PolicyRuleList.vue')
    const editor = read('apps/web/src/features/identity/PolicyEditor.vue')
    const operation = read('apps/web/src/features/identity/policy-write-operation.ts')
    const production = [client, page, rules, editor, operation].join('\n')
    expect(client).not.toContain('headers:')
    expect(production).not.toMatch(
      /evaluatePolicy|policyDecision|isAllowed|grantAuthority|profile\.kind|superAdmin|localStorage|sessionStorage|X-Tenant-ID|mock|preview|fallback/i,
    )
    expect(production).not.toMatch(/console\.|logger\.|analytics/)
  })
})
