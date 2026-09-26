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
    const source = 'apps/identity/src/services/config.ts'
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
        'apps/identity/src/services/config.spec.ts',
      ),
    ).not.toContain('no-restricted-imports')
  })
})
