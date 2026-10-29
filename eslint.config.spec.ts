import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const eslint = new ESLint({ cwd: root, overrideConfigFile: path.resolve(root, 'eslint.config.js') })

async function ruleIds(code: string, file: string): Promise<string[]> {
  const results = await eslint.lintText(code, { filePath: path.resolve(root, file) })
  return results.flatMap((result) => result.messages.map((message) => message.ruleId ?? ''))
}

describe('ESLint package boundaries', () => {
  it('requires generated MDM operations while preserving ordinary request data', async () => {
    const file = 'apps/mdm-old/src/features/policies/clients/policies.ts'
    for (const code of [
      'export const send = (transport: {request(): void}) => transport.request()',
      "export const send = (transport: {request(): void}) => transport['request']()",
    ])
      expect(await ruleIds(code, file)).toContain('no-restricted-syntax')
    expect(
      await ruleIds('export const label = (value: {request: string}) => value.request', file),
    ).not.toContain('no-restricted-syntax')
    expect(
      await ruleIds(
        "import {getApiV1Policies} from '@rss/api/mdm-operations'\nexport const op = getApiV1Policies",
        file,
      ),
    ).not.toContain('no-restricted-imports')
  })
  it('ignores generated application assets', async () => {
    expect(await eslint.isPathIgnored(path.resolve(root, 'apps/identity/dist/app.js'))).toBe(true)
  })
  it('keeps HTTP execution in api and presentation in core', async () => {
    expect(
      await ruleIds(
        "import axios from 'axios'\nexport const x = axios",
        'packages/api/src/transport.ts',
      ),
    ).not.toContain('no-restricted-imports')
    expect(
      await ruleIds(
        "import axios from 'axios'\nexport const x = axios",
        'packages/core/src/index.ts',
      ),
    ).toContain('no-restricted-imports')
    for (const file of ['packages/core/src/index.ts', 'packages/api/src/transport.ts']) {
      for (const dependency of ['@rss/core', '@rss/api/identity', '@rss/identity-app']) {
        expect(
          await ruleIds(`import { x } from '${dependency}'\nexport const y = x`, file),
        ).toContain('no-restricted-imports')
      }
    }
  })
  it('uses public Identity and UI exports, with test factories only in tests', async () => {
    const source = 'apps/identity/src/main.ts'
    for (const dependency of ['@rss/api/identity', '@rss/core']) {
      expect(
        await ruleIds(`import { x } from '${dependency}'\nexport const y = x`, source),
      ).not.toContain('no-restricted-imports')
    }
    for (const dependency of ['@rss/api/testing', '@rss/core/src/index', 'axios']) {
      expect(
        await ruleIds(`import { x } from '${dependency}'\nexport const y = x`, source),
      ).toContain('no-restricted-imports')
    }
    expect(
      await ruleIds(
        "import { networkErrorForTest } from '@rss/api/testing'\nexport const x = networkErrorForTest",
        'packages/auth/src/services/config.spec.ts',
      ),
    ).not.toContain('no-restricted-imports')
  })
})

it('keeps both app compositions and shared auth behind declared public exports', async () => {
  for (const file of ['apps/identity/src/main.ts', 'packages/auth/src/index.ts']) {
    expect(await ruleIds("import { x } from '@rss/api/mdm'\nexport const y = x", file)).toContain(
      'no-restricted-imports',
    )
  }
  for (const file of ['apps/mdm-old/src/main.ts', 'packages/auth/src/index.ts']) {
    expect(await ruleIds("import axios from 'axios'\nexport const y = axios", file)).toContain(
      'no-restricted-imports',
    )
  }
  expect(
    await ruleIds("import { x } from '@rss/auth'\nexport const y = x", 'apps/mdm-old/src/main.ts'),
  ).not.toContain('no-restricted-imports')
  expect(
    await ruleIds(
      "import { x } from '@rss/mdm-old-app'\nexport const y = x",
      'apps/identity/src/main.ts',
    ),
  ).toContain('no-restricted-imports')
})

it('permits owner factories only in the MDM composition roots', async () => {
  for (const [name, dependency] of [
    ['createSession', '@rss/auth'],
    ['createMdmTransport', '@rss/api/mdm'],
  ]) {
    const code = `import { ${name} } from '${dependency}'\nexport const factory = ${name}`
    expect(await ruleIds(code, 'apps/mdm-old/src/features.ts')).toContain('no-restricted-imports')
    expect(await ruleIds(code, 'apps/mdm-old/src/bootstrap.ts')).not.toContain(
      'no-restricted-imports',
    )
  }
})

it('allows sanitized transport failure factories only in MDM tests', async () => {
  const code =
    "import { networkErrorForTest } from '@rss/api/testing'\nexport const x = networkErrorForTest"
  expect(await ruleIds(code, 'apps/mdm-old/src/services/useOperation.spec.ts')).not.toContain(
    'no-restricted-imports',
  )
  expect(await ruleIds(code, 'apps/mdm-old/src/services/useOperation.ts')).toContain(
    'no-restricted-imports',
  )
})

it('allows the pure MDM budget export in the demo without opening private API modules', async () => {
  const file = 'apps/mdm-old/demo/plugin.ts'
  expect(
    await ruleIds(
      "import { MDM_JSON_BODY_LIMIT } from '@rss/api/mdm-limits'\nexport const x = MDM_JSON_BODY_LIMIT",
      file,
    ),
  ).not.toContain('no-restricted-imports')
  expect(
    await ruleIds("import { execute } from '@rss/api/transport'\nexport const x = execute", file),
  ).toContain('no-restricted-imports')
})

it('allows the shared upload limit in feature views while keeping transport factories forbidden', async () => {
  const file = 'apps/mdm-old/src/features/policies/client.ts'
  expect(
    await ruleIds(
      "import { MDM_CONTENT_BODY_LIMIT } from '@rss/api/mdm-limits'\nexport const x = MDM_CONTENT_BODY_LIMIT",
      file,
    ),
  ).not.toContain('no-restricted-imports')
  expect(
    await ruleIds(
      "import { createMdmTransport } from '@rss/api/mdm'\nexport const x = createMdmTransport",
      file,
    ),
  ).toContain('no-restricted-imports')
})

it('isolates the component preview from product and authentication clients', async () => {
  const file = 'apps/ui-preview/src/main.ts'
  expect(await ruleIds("import { x } from '@rss/core'; export const y = x", file)).not.toContain(
    'no-restricted-imports',
  )
  for (const dependency of [
    '@rss/auth',
    '@rss/api/mdm',
    '@rss/api/identity',
    '@rss/mdm-old-app',
    '@rss/core/src/index',
  ]) {
    expect(await ruleIds(`import { x } from '${dependency}'; export const y = x`, file)).toContain(
      'no-restricted-imports',
    )
  }
  expect(await ruleIds("fetch('/api/example')", file)).toContain('no-restricted-globals')
})

it('allows the stateless public profile JSON decoder without exposing auth internals', async () => {
  const file = 'apps/mdm-old/src/features/settings/clients/profiles.ts'
  expect(
    await ruleIds(
      "import { profileJson } from '@rss/auth/profile-json'; export const decode = profileJson",
      file,
    ),
  ).not.toContain('no-restricted-imports')
  expect(
    await ruleIds(
      "import { createSession } from '@rss/auth/session'; export const owner = createSession",
      file,
    ),
  ).toContain('no-restricted-imports')
})

it('blocks production MDM imports of demo modules for static and lazy dependencies', async () => {
  for (const code of [
    "import { demoKey } from '../demo/context'; export const x = demoKey",
    "export const x = () => import('../demo/bootstrap')",
  ]) {
    expect(await ruleIds(code, 'apps/mdm-old/src/bootstrap.ts')).toContain(
      'identity-boundary/contained',
    )
    expect(await ruleIds(code, 'apps/mdm-old/src/bootstrap.spec.ts')).not.toContain(
      'identity-boundary/contained',
    )
  }
  expect(
    await ruleIds(
      "import { createMdm } from '../src/bootstrap'; export const x = createMdm",
      'apps/mdm-old/demo/bootstrap.ts',
    ),
  ).not.toContain('identity-boundary/contained')
})

it('keeps the standalone DA and its HTTP demo separate', async () => {
  const file = 'apps/device-access/src/config.ts'
  for (const value of [
    '../demo/client',
    '../../mdm/src/context',
    '@rss/api/device-access-demo',
    '@rss/device-access/src/client',
  ]) {
    const errors = await ruleIds(`import { x } from '${value}'\nexport const y=x`, file)
    expect(errors.some((e) => e === 'da-boundary/contained' || e === 'no-restricted-imports')).toBe(
      true,
    )
  }
  expect(
    await ruleIds("import {createSession} from '@rss/auth'\nexport const x=createSession", file),
  ).toContain('no-restricted-imports')
  expect(await ruleIds("export const x=fetch('/api/v1/devices')", file)).toContain(
    'no-restricted-globals',
  )
  expect(await ruleIds("export const x=import('../demo/client')", file)).toContain(
    'da-boundary/contained',
  )
  expect(
    await ruleIds("import {useDa} from './context'\nexport const x=useDa", file),
  ).not.toContain('da-boundary/contained')
})

it('allows only the shared stylesheet generator from application build configs', async () => {
  for (const app of ['identity', 'mdm-old']) {
    expect(
      await ruleIds(
        "import { vuetifyStyles } from '../../build/vuetify-styles.mjs'; export const x = vuetifyStyles",
        `apps/${app}/vite.config.ts`,
      ),
    ).not.toContain('identity-boundary/contained')
    expect(
      await ruleIds(
        "import { vuetifyStyles } from '../../../build/vuetify-styles.mjs'; export const x = vuetifyStyles",
        `apps/${app}/src/main.ts`,
      ),
    ).toContain('identity-boundary/contained')
  }
})

it('keeps React core, adapter and UI dependencies directed, including relative escapes', async () => {
  for (const value of ['@rss/auth/session', 'vuetify', 'vue']) {
    expect(
      await ruleIds(`import {x} from '${value}'; export const y=x`, 'apps/mdm/src/main.tsx'),
    ).toContain('no-restricted-imports')
  }
  expect(
    await ruleIds("export * from '../../auth-http/src/index'", 'packages/auth-core/src/index.ts'),
  ).toContain('react-boundary/contained')
  expect(
    await ruleIds("export * from '@rss/api/identity'", 'packages/auth-core/src/index.ts'),
  ).toContain('no-restricted-imports')
  expect(
    await ruleIds("export * from '@rss/auth-core'", 'packages/auth-http/src/index.ts'),
  ).not.toContain('no-restricted-imports')
  expect(
    await ruleIds(
      "export const x = import('../../mdm-old/src/bootstrap')",
      'apps/mdm/src/main.tsx',
    ),
  ).toContain('react-boundary/contained')
})

it('keeps the DA stylesheet build helper out of product source imports', async () => {
  expect(
    await ruleIds(
      "import { vuetifyStyles } from '../../build/vuetify-styles.mjs'; export const x = vuetifyStyles",
      'apps/device-access/vite.config.ts',
    ),
  ).not.toContain('da-boundary/contained')
  expect(
    await ruleIds(
      "import { vuetifyStyles } from '../../../build/vuetify-styles.mjs'; export const x = vuetifyStyles",
      'apps/device-access/src/main.ts',
    ),
  ).toContain('da-boundary/contained')
})

it('keeps the MDM domain cores independent and their adapters out of feature composition', async () => {
  for (const name of [
    'mdm-authorization',
    'mdm-tenant-administration',
    'mdm-user-profiles',
    'mdm-devices',
    'mdm-enrollment',
    'mdm-connections',
    'mdm-inventory',
    'mdm-groups',
    'mdm-compliance',
    'mdm-resources',
    'mdm-content',
    'mdm-software',
  ]) {
    for (const dependency of ['@rss/api/mdm-operations', 'react', '@rss/auth-core'])
      expect(
        await ruleIds(`export * from '${dependency}'`, `packages/${name}/src/index.ts`),
      ).toContain('no-restricted-imports')
    expect(
      await ruleIds("export * from '../../mdm-http/src/index'", `packages/${name}/src/index.ts`),
    ).toContain('react-boundary/contained')
    expect(
      await ruleIds(`export * from '@rss/${name}'`, 'packages/mdm-http/src/authorization.ts'),
    ).not.toContain('no-restricted-imports')
  }
  expect(
    await ruleIds("export * from '@rss/mdm-authorization'", 'packages/auth-http/src/index.ts'),
  ).toContain('no-restricted-imports')
  for (const dependency of ['@rss/api/mdm', '@rss/mdm-http/authorization'])
    expect(
      await ruleIds(`export * from '${dependency}'`, 'apps/mdm/src/Authorization.tsx'),
    ).toContain('no-restricted-imports')
  expect(
    await ruleIds(
      "import {createSession} from '@rss/auth-core'; export const x=createSession",
      'apps/mdm/src/Authorization.tsx',
    ),
  ).toContain('no-restricted-imports')
  expect(
    await ruleIds("export * from '@rss/mdm-http/authorization'", 'apps/mdm/src/runtime.ts'),
  ).not.toContain('no-restricted-imports')
})

it('allows only the shared pure asset models across inventory, group and compliance cores', async () => {
  for (const name of ['mdm-inventory', 'mdm-groups', 'mdm-compliance']) {
    expect(
      await ruleIds("export * from '@rss/mdm-devices'", `packages/${name}/src/index.ts`),
    ).not.toContain('no-restricted-imports')
    expect(
      await ruleIds("export * from '@rss/mdm-compliance'", `packages/${name}/src/authoring.ts`),
    ).toContain('no-restricted-imports')
    expect(
      await ruleIds(
        "export * from '../../mdm-http/src/inventory'",
        `packages/${name}/src/index.ts`,
      ),
    ).toContain('react-boundary/contained')
    expect(
      await ruleIds(`export * from '@rss/${name}'`, 'apps/mdm/src/Inventory.tsx'),
    ).not.toContain('no-restricted-imports')
  }
  for (const name of ['mdm-groups', 'mdm-compliance'])
    expect(
      await ruleIds("export * from '@rss/mdm-inventory'", `packages/${name}/src/index.ts`),
    ).not.toContain('no-restricted-imports')
  expect(
    await ruleIds("export * from '@rss/mdm-groups'", 'packages/mdm-inventory/src/index.ts'),
  ).toContain('no-restricted-imports')
})

it('keeps resource authoring and content transfer in separate pure owners', async () => {
  for (const name of ['mdm-resources', 'mdm-content', 'mdm-software']) {
    expect(
      await ruleIds("export * from '@rss/mdm-inventory'", `packages/${name}/src/index.ts`),
    ).not.toContain('no-restricted-imports')
    expect(
      await ruleIds("export * from '@rss/mdm-resources'", `packages/${name}/src/index.ts`),
    ).not.toContain('no-restricted-imports')
    expect(
      await ruleIds(`export * from '@rss/${name}'`, 'apps/mdm/src/Resources.tsx'),
    ).not.toContain('no-restricted-imports')
  }
  for (const name of ['mdm-inventory', 'mdm-resources', 'mdm-software'])
    expect(
      await ruleIds("export * from '@rss/mdm-content'", `packages/${name}/src/index.ts`),
    ).toContain('no-restricted-imports')
  expect(
    await ruleIds("export * from '@rss/mdm-resources'", 'packages/mdm-inventory/src/index.ts'),
  ).toContain('no-restricted-imports')
  expect(
    await ruleIds(
      "export * from '@rss/mdm-software/publications'",
      'packages/mdm-content/src/index.ts',
    ),
  ).toContain('no-restricted-imports')
  expect(
    await ruleIds(
      "export * from '@rss/mdm-software/publications'",
      'apps/mdm/src/SoftwarePublications.tsx',
    ),
  ).not.toContain('no-restricted-imports')
  expect(
    await ruleIds("export * from '@rss/mdm-http/content'", 'apps/mdm/src/ContentUpload.tsx'),
  ).toContain('no-restricted-imports')
})
