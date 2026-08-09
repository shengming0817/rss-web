import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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
      ['RSS_WEB_PRIMARY_HOST', 'primary; include /tmp/evil'],
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
  })

  it('defines a closed listener route table and tenant injection set', () => {
    const template = read('deploy/web/templates/default.conf.template')
    for (const route of [
      '/api/v1/identity/',
      '/api/v1/settings/',
      '/api/v1/audit/',
      '/api/v1/runtime/inventory',
    ]) {
      expect(template).toContain(route)
    }
    expect(template).toContain('default "";')
    expect(template).toContain('"/api/v1/identity/login" "${RSS_WEB_TENANT_ID}";')
    expect(template).toContain('"/api/v1/identity/refresh" "${RSS_WEB_TENANT_ID}";')
    expect(template.match(/"\$\{RSS_WEB_TENANT_ID\}"/g)).toHaveLength(2)
    expect(template).toContain('location ^~ /internal/')
    expect(template).toContain('location ^~ /health/')
    expect(template).toContain('location = /metrics')
    expect(template).toContain('location ^~ /api/ { return 404; }')
    expect(read('deploy/web/proxy-common.conf')).toContain('proxy_next_upstream off;')
  })

  it('uses server-side same-origin configuration only', () => {
    expect(read('apps/web/env.d.ts')).not.toContain('VITE_API_BASE')
    expect(read('deploy/web/Dockerfile')).toContain('/etc/nginx/templates/default.conf.template')
    expect(read('deploy/web/Dockerfile')).toContain('/docker-entrypoint.d/15-validate-edge-env.sh')
  })

  it('pins the reviewed RSS runtime assembly evidence', () => {
    const adr = read('docs/architecture/20260809-006-same-origin-edge-tenant-bootstrap.md')
    for (const evidence of [
      '475bfa88e17769899916b69f357261160000b01b',
      '86013539f14d26dffc9e83a35e6cec95b2d764f55001cdd06b0f133fa9743463',
      '6f2d970a4be08ba9a15febc19d0134fda3495ad7b93d930141f2235be14227cb',
      'd25961002433c97ed8eecdbd309cf22e6c5c6643b16ef580c6af1c1522df39a9',
    ]) {
      expect(adr).toContain(evidence)
    }
  })
})
