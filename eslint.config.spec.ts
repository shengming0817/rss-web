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
})
