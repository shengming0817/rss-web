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
  it('ignores generated production and demo build artifacts', async () => {
    await expect(eslint.isPathIgnored(path.resolve(root, 'apps/web/dist/app.js'))).resolves.toBe(
      true,
    )
    await expect(
      eslint.isPathIgnored(path.resolve(root, 'apps/web/dist-preview-demo/app.js')),
    ).resolves.toBe(true)
  })

  it('allows core to depend on shared', async () => {
    expect(
      await ruleIds(
        "import { invariant } from '@rss/shared'\nexport const x = invariant\n",
        'packages/core/src/index.ts',
      ),
    ).not.toContain('no-restricted-imports')
  })

  it('allows api to own axios', async () => {
    expect(
      await ruleIds(
        "import axios from 'axios'\nexport const x = axios\n",
        'packages/api/src/transport.ts',
      ),
    ).not.toContain('no-restricted-imports')
  })

  it('blocks core from depending on api or removed business packages', async () => {
    for (const dependency of ['api', 'access', 'audit', 'config', 'contracts', 'observability']) {
      expect(
        await ruleIds(
          `import { x } from '@rss/${dependency}'\nexport const y = x\n`,
          'packages/core/src/index.ts',
        ),
      ).toContain('no-restricted-imports')
    }
  })

  it('blocks api from depending on UI or removed business packages', async () => {
    for (const dependency of ['core', 'access', 'audit', 'config', 'contracts', 'observability']) {
      expect(
        await ruleIds(
          `import { x } from '@rss/${dependency}'\nexport const y = x\n`,
          'packages/api/src/transport.ts',
        ),
      ).toContain('no-restricted-imports')
    }
  })

  it('allows identity to use the API seam and only the controller to use session capability', async () => {
    for (const dependency of ['@rss/api', '@rss/api/endpoints/identity']) {
      expect(
        await ruleIds(
          `import { x } from '${dependency}'\nexport const y = x\n`,
          'packages/identity/src/api/client.ts',
        ),
      ).not.toContain('no-restricted-imports')
    }
    expect(
      await ruleIds(
        "import { createSessionHttpTransport } from '@rss/api/session'\nexport const x = createSessionHttpTransport\n",
        'packages/identity/src/session/controller.ts',
      ),
    ).not.toContain('no-restricted-imports')
    for (const file of [
      'packages/identity/src/api/client.ts',
      'packages/identity/src/index.ts',
      'packages/identity/src/session/types.ts',
    ]) {
      expect(
        await ruleIds(
          "import { createSessionHttpTransport } from '@rss/api/session'\nexport const x = createSessionHttpTransport\n",
          file,
        ),
      ).toContain('no-restricted-imports')
    }
    for (const dependency of ['@rss/core', '@rss/shared', '@rss/api/endpoints/settings']) {
      expect(
        await ruleIds(
          `import { x } from '${dependency}'\nexport const y = x\n`,
          'packages/identity/src/api/client.ts',
        ),
      ).toContain('no-restricted-imports')
    }
  })

  it('blocks Axios in identity and endpoint coordinates in the web app', async () => {
    expect(
      await ruleIds(
        "import axios from 'axios'\nexport const x = axios\n",
        'packages/identity/src/api/client.ts',
      ),
    ).toContain('no-restricted-imports')
    expect(
      await ruleIds(
        "import { decodeWireErrorForTest } from '@rss/api/testing'\nexport const x = decodeWireErrorForTest\n",
        'packages/identity/src/api/client.ts',
      ),
    ).toContain('no-restricted-imports')
    expect(
      await ruleIds(
        "import { createSessionHttpTransport } from '@rss/api/session'\nexport const x = createSessionHttpTransport\n",
        'apps/web/src/main.ts',
      ),
    ).toContain('no-restricted-imports')
    expect(
      await ruleIds(
        "import { decodeWireErrorForTest } from '@rss/api/testing'\nexport const x = decodeWireErrorForTest\n",
        'apps/web/src/main.ts',
      ),
    ).toContain('no-restricted-imports')
    expect(
      await ruleIds(
        "import { decodeWireErrorForTest } from '@rss/api/testing'\nexport const x = decodeWireErrorForTest\n",
        'apps/web/src/features/identity/identity-error.spec.ts',
      ),
    ).not.toContain('no-restricted-imports')
    expect(
      await ruleIds(
        "import { identityEndpoints } from '@rss/api/endpoints/identity'\nexport const x = identityEndpoints\n",
        'apps/web/src/main.ts',
      ),
    ).toContain('no-restricted-imports')
  })

  it('blocks package deep imports', async () => {
    expect(
      await ruleIds(
        "import { x } from '@rss/core/src/internal'\nexport const y = x\n",
        'apps/web/src/main.ts',
      ),
    ).toContain('no-restricted-imports')
  })

  it('blocks axios in the web app', async () => {
    expect(
      await ruleIds("import axios from 'axios'\nexport const x = axios\n", 'apps/web/src/main.ts'),
    ).toContain('no-restricted-imports')
  })

  it('keeps static release diagnostics outside runtime and network seams', async () => {
    for (const file of ['apps/web/src/release-meta.ts', 'apps/web/src/views/AboutView.vue']) {
      const source = (body: string) =>
        file.endsWith('.vue')
          ? `<script setup lang="ts">\n${body}</script>\n<template><p /></template>`
          : body
      expect(
        await ruleIds(
          source("import { createRuntimeApi } from '@rss/runtime'\nvoid createRuntimeApi\n"),
          file,
        ),
      ).toContain('no-restricted-imports')
      expect(await ruleIds(source('void fetch\n'), file)).toContain('no-restricted-globals')
      expect(await ruleIds(source('void globalThis.fetch\n'), file)).toContain(
        'no-restricted-properties',
      )
    }

    expect(
      await ruleIds(
        '<script setup lang="ts">\nimport { createRuntimeApi } from \'@rss/runtime\'\nvoid createRuntimeApi\n</script>\n<template><p /></template>',
        'packages/core/src/components/DegradedState.vue',
      ),
    ).toContain('no-restricted-imports')
    expect(
      await ruleIds(
        '<script setup lang="ts">\nvoid fetch\n</script>\n<template><p /></template>',
        'packages/core/src/components/DegradedState.vue',
      ),
    ).toContain('no-restricted-globals')

    expect(
      await ruleIds(
        "import { createWebRuntime } from './bootstrap'\nvoid createWebRuntime\n",
        'apps/web/src/release-meta.ts',
      ),
    ).toContain('no-restricted-imports')
    expect(
      await ruleIds(
        '<script setup lang="ts">\nimport { useRuntimeApi } from \'../features/runtime/runtime-context\'\nvoid useRuntimeApi\n</script>\n<template><p /></template>',
        'apps/web/src/views/AboutView.vue',
      ),
    ).toContain('no-restricted-imports')
    expect(
      await ruleIds(
        '<script setup lang="ts">\nimport type { WebReleaseMeta } from \'../release-meta\'\nvoid (undefined as unknown as WebReleaseMeta)\n</script>\n<template><p /></template>',
        'apps/web/src/views/AboutView.vue',
      ),
    ).not.toContain('no-restricted-imports')
    expect(
      await ruleIds(
        '<script setup lang="ts">\nimport { createWebRuntime } from \'../../../../apps/web/src/bootstrap\'\nvoid createWebRuntime\n</script>\n<template><p /></template>',
        'packages/core/src/components/DegradedState.vue',
      ),
    ).toContain('no-restricted-imports')
    for (const bypass of [
      './../../../../apps/web/src/bootstrap',
      '.././../../../apps/web/src/bootstrap',
    ]) {
      expect(
        await ruleIds(
          `<script setup lang="ts">\nimport { createWebRuntime } from '${bypass}'\nvoid createWebRuntime\n</script>\n<template><p /></template>`,
          'packages/core/src/components/DegradedState.vue',
        ),
      ).toContain('no-restricted-imports')
    }
    for (const localImport of ['./error-presentation', './ErrorPage.vue', './SourceBadge.vue']) {
      expect(
        await ruleIds(
          `<script setup lang="ts">\nimport value from '${localImport}'\nvoid value\n</script>\n<template><p /></template>`,
          'packages/core/src/components/DegradedState.vue',
        ),
      ).not.toContain('no-restricted-imports')
    }
  })

  it('blocks Preview authorization imports in production app source', async () => {
    for (const file of [
      'apps/web/src/bootstrap.ts',
      'apps/web/src/bootstrap.js',
      'apps/web/src/bootstrap.mjs',
    ]) {
      expect(
        await ruleIds(
          "import { createPreviewAuthorizationPort } from '@rss/authorization/preview'\nexport const x = createPreviewAuthorizationPort\n",
          file,
        ),
      ).toContain('no-restricted-imports')
    }
  })

  it('blocks release ledger imports through package-like and relative app paths', async () => {
    for (const dependency of [
      'docs/contracts/20260812-rss-release-baseline.json',
      '../../../../docs/contracts/20260812-rss-release-baseline.json',
      './.././../../../docs/contracts/20260812-rss-release-baseline.json',
    ]) {
      expect(
        await ruleIds(
          `import ledger from '${dependency}'\nexport const x = ledger\n`,
          'apps/web/src/bootstrap.ts',
        ),
      ).toContain('no-restricted-imports')
    }
  })

  it('keeps authorization independent from HTTP and other workspace packages', async () => {
    for (const dependency of ['@rss/api', '@rss/core', '@rss/identity', 'axios']) {
      expect(
        await ruleIds(
          `import { x } from '${dependency}'\nexport const y = x\n`,
          'packages/authorization/src/index.ts',
        ),
      ).toContain('no-restricted-imports')
    }
  })

  it('keeps domain adapters behind their exact API endpoint owner', async () => {
    for (const [domain, endpoint, client] of [
      ['runtime', 'runtime', 'api/client.ts'],
      ['audit', 'audit', 'api/client.ts'],
      ['settings', 'settings', 'client.ts'],
    ] as const) {
      expect(
        await ruleIds(
          `import { x } from '@rss/api/endpoints/${endpoint}'\nexport const y = x\n`,
          `packages/${domain}/src/${client}`,
        ),
      ).not.toContain('no-restricted-imports')
      for (const dependency of ['axios', '@rss/core', '@rss/identity', '@rss/api/session']) {
        expect(
          await ruleIds(
            `import { x } from '${dependency}'\nexport const y = x\n`,
            `packages/${domain}/src/${client}`,
          ),
        ).toContain('no-restricted-imports')
      }
    }
  })
})

it('contains Identity relative imports within the app', async () => {
  for (const specifier of [
    '../../../packages/api/src/transport',
    '../../web/src/main',
    '../../../packages/settings/src/index',
  ]) {
    expect(
      await ruleIds(`export { x } from '${specifier}'`, 'apps/identity/src/main.ts'),
    ).toContain('identity-boundary/contained')
  }
  expect(
    await ruleIds("export { x } from './services/session'", 'apps/identity/src/main.ts'),
  ).not.toContain('identity-boundary/contained')
})
