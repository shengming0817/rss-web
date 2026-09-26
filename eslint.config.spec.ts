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
  for (const file of ['apps/mdm/src/main.ts', 'packages/auth/src/index.ts']) {
    expect(await ruleIds("import axios from 'axios'\nexport const y = axios", file)).toContain(
      'no-restricted-imports',
    )
  }
  expect(
    await ruleIds("import { x } from '@rss/auth'\nexport const y = x", 'apps/mdm/src/main.ts'),
  ).not.toContain('no-restricted-imports')
  expect(
    await ruleIds(
      "import { x } from '@rss/mdm-app'\nexport const y = x",
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
    expect(await ruleIds(code, 'apps/mdm/src/features.ts')).toContain('no-restricted-imports')
    expect(await ruleIds(code, 'apps/mdm/src/bootstrap.ts')).not.toContain('no-restricted-imports')
  }
})

it('allows sanitized transport failure factories only in MDM tests', async () => {
  const code =
    "import { networkErrorForTest } from '@rss/api/testing'\nexport const x = networkErrorForTest"
  expect(await ruleIds(code, 'apps/mdm/src/services/useOperation.spec.ts')).not.toContain(
    'no-restricted-imports',
  )
  expect(await ruleIds(code, 'apps/mdm/src/services/useOperation.ts')).toContain(
    'no-restricted-imports',
  )
})

it('allows the pure MDM budget export in the demo without opening private API modules', async () => {
  const file = 'apps/mdm/demo/plugin.ts'
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
