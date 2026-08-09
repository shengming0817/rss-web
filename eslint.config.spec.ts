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
  it('allows core to depend on shared', async () => {
    expect(
      await ruleIds(
        "import { invariant } from '@gocell/shared'\nexport const x = invariant\n",
        'packages/core/src/index.ts',
      ),
    ).not.toContain('no-restricted-imports')
  })

  it('allows request to own axios', async () => {
    expect(
      await ruleIds(
        "import axios from 'axios'\nexport const x = axios\n",
        'packages/request/src/http.ts',
      ),
    ).not.toContain('no-restricted-imports')
  })

  it('blocks core from depending on request or removed business packages', async () => {
    for (const dependency of [
      'request',
      'access',
      'audit',
      'config',
      'contracts',
      'observability',
    ]) {
      expect(
        await ruleIds(
          `import { x } from '@gocell/${dependency}'\nexport const y = x\n`,
          'packages/core/src/index.ts',
        ),
      ).toContain('no-restricted-imports')
    }
  })

  it('blocks request from depending on UI or removed business packages', async () => {
    for (const dependency of ['core', 'access', 'audit', 'config', 'contracts', 'observability']) {
      expect(
        await ruleIds(
          `import { x } from '@gocell/${dependency}'\nexport const y = x\n`,
          'packages/request/src/http.ts',
        ),
      ).toContain('no-restricted-imports')
    }
  })

  it('blocks package deep imports', async () => {
    expect(
      await ruleIds(
        "import { x } from '@gocell/core/src/internal'\nexport const y = x\n",
        'apps/web/src/main.ts',
      ),
    ).toContain('no-restricted-imports')
  })

  it('blocks axios in the web app', async () => {
    expect(
      await ruleIds("import axios from 'axios'\nexport const x = axios\n", 'apps/web/src/main.ts'),
    ).toContain('no-restricted-imports')
  })
})
