import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'root',
          environment: 'node',
          include: [
            '*.spec.ts',
            'apps/mdm/src/lifecycle.spec.ts',
            'apps/mdm/src/assets-lifecycle.spec.ts',
            'apps/mdm/src/resources-lifecycle.spec.ts',
            'apps/mdm/src/material-source.spec.ts',
            'apps/mdm/src/public-materials.spec.ts',
            'apps/mdm/src/certificates-lifecycle.spec.ts',
            'apps/mdm/src/ceremony-handoff.spec.ts',
            'apps/mdm/src/native-credential-input.spec.ts',
            'apps/mdm/src/recovery-lifecycle.spec.ts',
          ],
          exclude: ['**/node_modules/**', '**/dist/**'],
          // ESLint's type-aware boundary checks need time to initialize on CI.
          testTimeout: 30_000,
        },
      },
      'packages/*/vitest.config.ts',
      'apps/*/vitest.config.ts',
    ],
  },
})
