import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname)
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const productionOwners = (...paths: string[]) =>
  execFileSync(
    '/usr/bin/git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...paths],
    { cwd: root, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter((path) => !path.endsWith('.spec.ts') && !path.endsWith('.typecheck.ts'))
const settingsProductionOwners = () =>
  productionOwners('apps/web/src/features/settings', 'packages/settings/src')
const applicationProductionOwners = () =>
  productionOwners('apps', 'packages').filter((path) => /\.(?:ts|vue)$/.test(path))

describe('Settings config security boundary', () => {
  it('keeps publish and rollback non-replayable and 204 decoder-free', () => {
    const client = read('packages/settings/src/client.ts')
    expect(client).toContain("session: 'required-no-replay'")
    expect(client).toContain("session: 'required'")
    expect(client).toContain('...settingsEndpoints.secretResolve')
    expect(client).not.toContain('headers:')
    expect(client).not.toMatch(/retry|fallback|X-Tenant-ID/)
    expect(client).not.toMatch(/history|candidate|preview/i)
  })

  it('keeps sensitive values out of persistence and diagnostics owners', () => {
    const owners = settingsProductionOwners()
    expect(owners).toContain('apps/web/src/features/settings/ConfigView.vue')
    expect(owners).toContain('packages/settings/src/client.ts')
    const production = owners.map(read).join('\n')
    expect(production).not.toMatch(
      /localStorage|sessionStorage|indexedDB|console\.|logger\.|analytics/,
    )
    expect(production).not.toMatch(/query:|headers:|location\.|route\.query/)
  })

  it('keeps secret coordinates in a closed production owner set', () => {
    const coordinateOwners = applicationProductionOwners()
      .filter((path) => /\b(?:storeId|refKey|refVersion)\b/.test(read(path)))
      .sort()

    expect(coordinateOwners).toEqual([
      'apps/web/src/features/settings/SecretPublishView.vue',
      'apps/web/src/i18n/messages/en-US.ts',
      'apps/web/src/i18n/messages/zh-CN.ts',
      'packages/settings/src/client.ts',
      'packages/settings/src/secret/types.ts',
    ])
  })

  it('keeps secret material in an exact production owner set without persistence or diagnostics', () => {
    const materialOwners = applicationProductionOwners()
      .filter((path) =>
        /settings\.secret-resolve|\/api\/v1\/settings\/secrets\/[^'"`\s]+\/material|materialBase64|\bresolveSecret\b/i.test(
          read(path),
        ),
      )
      .sort()

    expect(materialOwners).toEqual([
      'apps/web/src/features/settings/SecretMaterialRevealView.vue',
      'apps/web/src/features/settings/secret-material-reveal-operation.ts',
      'apps/web/src/features/settings/secret-resolve-intent.ts',
      'packages/api/src/endpoints/settings.ts',
      'packages/settings/src/client.ts',
      'packages/settings/src/secret/decoders.ts',
      'packages/settings/src/secret/index.ts',
      'packages/settings/src/secret/types.ts',
    ])
    const production = materialOwners.map(read).join('\n')
    expect(production).not.toMatch(
      /localStorage|sessionStorage|indexedDB|console\.|logger\.|analytics|route\.query|location\.(?:search|hash)|URLSearchParams/,
    )
    expect(production).not.toMatch(/fallback|auto.?retry/i)
  })
})
