import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname)
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const validator = resolve(root, 'deploy/web/docker-entrypoint.d/15-validate-edge-env.sh')
const validEnv = {
  RSS_WEB_TENANT_ID: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  RSS_WEB_PRIMARY_HOST: 'rss-primary',
  RSS_WEB_PRIMARY_PORT: '8080',
  RSS_WEB_ADMIN_HOST: 'rss-admin',
  RSS_WEB_ADMIN_PORT: '8081',
}

interface PackageManifest {
  readonly name: string
  readonly dependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
  readonly optionalDependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
}

function workspaceDependencyClosure(
  rootName: string,
  manifests: ReadonlyMap<string, PackageManifest>,
): ReadonlySet<string> {
  const closure = new Set<string>()
  const visit = (name: string): void => {
    const manifest = manifests.get(name)
    if (manifest === undefined) throw new Error(`Missing workspace manifest for ${name}`)
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    }
    for (const [dependency, version] of Object.entries(dependencies)) {
      if (!version.startsWith('workspace:') || closure.has(dependency)) continue
      closure.add(dependency)
      visit(dependency)
    }
  }
  visit(rootName)
  closure.delete(rootName)
  return closure
}

function repositoryWorkspaceManifests(): ReadonlyMap<string, PackageManifest> {
  const manifests = new Map<string, PackageManifest>()
  const add = (path: string): void => {
    const manifest = JSON.parse(read(path)) as PackageManifest
    manifests.set(manifest.name, manifest)
  }
  add('apps/web/package.json')
  for (const entry of readdirSync(resolve(root, 'packages'), { withFileTypes: true })) {
    if (entry.isDirectory()) add(`packages/${entry.name}/package.json`)
  }
  return manifests
}

function validate(overrides: Record<string, string | undefined> = {}) {
  const env = { ...process.env, ...validEnv }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key]
    else env[key] = value
  }
  return spawnSync('/bin/sh', [validator], { env, encoding: 'utf8' })
}

describe('RSS Web edge configuration', () => {
  it('accepts only complete, typed deployment configuration', () => {
    expect(validate().status).toBe(0)
    for (const [key, value] of [
      ['RSS_WEB_TENANT_ID', undefined],
      ['RSS_WEB_TENANT_ID', ''],
      ['RSS_WEB_TENANT_ID', 'F47AC10B-58CC-4372-A567-0E02B2C3D479'],
      ['RSS_WEB_TENANT_ID', '00000000-0000-0000-0000-000000000000'],
      ['RSS_WEB_TENANT_ID', 'f47ac10b58cc4372a5670e02b2c3d479'],
      ['RSS_WEB_TENANT_ID', 'f47ac10b-58cc-4372-a567-0e02b2c3d479\n"; include /tmp/evil; #'],
      ['RSS_WEB_PRIMARY_HOST', 'primary; include /tmp/evil'],
      ['RSS_WEB_PRIMARY_HOST', 'rss-primary\nrss-admin'],
      ['RSS_WEB_ADMIN_HOST', 'https://admin.example'],
      ['RSS_WEB_PRIMARY_PORT', '0'],
      ['RSS_WEB_ADMIN_PORT', '65536'],
      ['RSS_WEB_ADMIN_PORT', '08'],
    ] as const) {
      expect(validate({ [key]: value }).status, `${key}=${String(value)}`).not.toBe(0)
    }
    expect(
      validate({ RSS_WEB_ADMIN_HOST: 'rss-primary', RSS_WEB_ADMIN_PORT: '8080' }).status,
    ).not.toBe(0)
    expect(
      validate({ RSS_WEB_ADMIN_HOST: 'RSS-PRIMARY', RSS_WEB_ADMIN_PORT: '8080' }).status,
    ).not.toBe(0)
  })

  it('defines a closed listener route table and tenant injection set', () => {
    const template = read('deploy/web/templates/default.conf.template')
    for (const route of [
      '/api/v1/identity/',
      '/api/v1/settings/',
      '/api/v1/audit/entries',
      '/api/v1/audit/tenants/',
      '/api/v1/runtime/inventory',
    ]) {
      expect(template).toContain(route)
    }
    expect(template).toContain('default "";')
    expect(template).toContain('~^/api/v1/identity/login(?:\\?.*)?$ "${RSS_WEB_TENANT_ID}";')
    expect(template).toContain('~^/api/v1/identity/refresh(?:\\?.*)?$ "${RSS_WEB_TENANT_ID}";')
    expect(template.match(/"\$\{RSS_WEB_TENANT_ID\}"/g)).toHaveLength(2)
    expect(template).toContain('location ^~ /internal/')
    expect(template).toContain('location ^~ /health/')
    expect(template).toContain('location = /metrics')
    expect(template).toContain(
      'location ~ "^/api/v1/audit/tenants/(?!00000000-0000-0000-0000-000000000000)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/entries$"',
    )
    expect(template).toContain('location /api/ { return 404; }')
    expect(template).toContain('~*^/api/.*%2f 1;')
    expect(template).toContain('if ($rss_invalid_api_path) { return 404; }')
    expect(template).not.toContain('location ^~ /api/ { return 404; }')
    expect(template).not.toContain('location ^~ /api/v1/audit/')
    for (const exactPath of ['/api', '/internal', '/health']) {
      expect(template).toContain(`location = ${exactPath} { return 404; }`)
    }
    expect(template).toContain('location ^~ /metrics/')
    expect(read('deploy/web/proxy-common.conf')).toContain('proxy_next_upstream off;')
  })

  it('uses server-side same-origin configuration only', () => {
    expect(read('apps/web/env.d.ts')).not.toContain('VITE_API_BASE')
    expect(read('deploy/web/Dockerfile')).toContain('/etc/nginx/templates/default.conf.template')
    expect(read('deploy/web/Dockerfile')).toContain('/docker-entrypoint.d/15-validate-edge-env.sh')
  })

  it('installs every Web workspace dependency in the cached Docker dependency layer', () => {
    const dockerfile = read('deploy/web/Dockerfile')
    const manifests = repositoryWorkspaceManifests()
    const expected = [...workspaceDependencyClosure('@rss/web', manifests)].sort()
    const copied = [
      ...dockerfile.matchAll(
        /^COPY packages\/([^/]+)\/package\.json packages\/\1\/package\.json$/gm,
      ),
    ]
      .map((match) => manifests.get(`@rss/${match[1]}`)?.name)
      .filter((name): name is string => name !== undefined)
      .sort()
    expect(copied).toEqual(expected)
  })

  it('computes transitive workspace dependencies rather than direct dependencies only', () => {
    const manifests = new Map<string, PackageManifest>([
      ['@rss/web', { name: '@rss/web', dependencies: { '@rss/a': 'workspace:*' } }],
      ['@rss/a', { name: '@rss/a', dependencies: { '@rss/b': 'workspace:*' } }],
      ['@rss/b', { name: '@rss/b' }],
    ])
    expect([...workspaceDependencyClosure('@rss/web', manifests)].sort()).toEqual([
      '@rss/a',
      '@rss/b',
    ])
  })

  it('pins the reviewed RSS runtime assembly evidence', () => {
    const adr = read('docs/architecture/20260809-006-same-origin-edge-tenant-bootstrap.md')
    for (const evidence of [
      'b7f3e1d0bcc5b2e59639a81b4f37937914b53f00',
      '4fbe9262515845ec94cdd42ead7d8e78333361520b46ab538e50a6e52580b092',
      'b59231e06dde78efff866df4efa636f3a261d2bfd35a1be78dfa1bc99d33c425',
      '6088747ce9f2219164d26fa6dfcea0f758b5986ccad4b2550da05bf62b36ea45',
    ]) {
      expect(adr).toContain(evidence)
    }
  })
})
