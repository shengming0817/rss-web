import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginImportX from 'eslint-plugin-import-x'
import configPrettier from 'eslint-config-prettier'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import path, { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DEEP_PATH_PATTERN = {
  regex: '^@rss/[^/]+/src/',
  message: 'Use declared public package exports.',
}
const NO_AXIOS_PATH = { name: 'axios', message: 'HTTP belongs to @rss/api.' }
const NO_NETWORK = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
  name,
  message: 'Use the product transport in @rss/api.',
}))
const NO_NETWORK_PROPERTIES = ['window', 'globalThis'].flatMap((object) =>
  ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((property) => ({
    object,
    property,
    message: 'Use the product transport in @rss/api.',
  })),
)
function boundaryRule(extraPatterns = [], extraPaths = []) {
  return ['error', { patterns: [DEEP_PATH_PATTERN, ...extraPatterns], paths: extraPaths }]
}
export default tseslint.config(
  // ── Global ignores ──────────────────────────────────────────────────────────
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      'pnpm-lock.yaml',
      'worktrees/**',
      '.specify/**',
      'docs/design/**', // Approved standalone design references are not product source
      '**/node_modules/**',
      'packages/api/src/generated/**',
    ],
  },

  // ── Base JS recommended ─────────────────────────────────────────────────────
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      globals: Object.fromEntries(
        [
          'Event',
          'PageTransitionEvent',
          'URL',
          'URLSearchParams',
          'clearTimeout',
          'console',
          'document',
          'getComputedStyle',
          'innerWidth',
          'localStorage',
          'location',
          'sessionStorage',
          'setInterval',
          'setTimeout',
          'structuredClone',
          'window',
        ].map((name) => [name, 'readonly']),
      ),
    },
  },

  // ── TypeScript recommended ──────────────────────────────────────────────────
  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        // TypeScript semantics are checked by tsc.
        project: false,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      'import-x': pluginImportX,
    },
    settings: {
      // Generated imports are fixed by generate-contracts/--check; do not expand their compiled validator ASTs for cycle analysis.
      'import-x/ignore': ['/packages/api/src/generated/'],
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: path.resolve(__dirname, 'tsconfig.base.json'),
        }),
      ],
    },
    rules: {
      // ── TypeScript ────────────────────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],

      // ── import-x 基础 ─────────────────────────────────────────────────────
      'import-x/no-duplicates': 'error',
      'import-x/no-cycle': ['error', { maxDepth: 3 }],

      // ── 全局: 深路径禁止 (Hard) ────────────────────────────────────────────
      // 禁止 @rss/*/src/** 深路径，强制走 package.json#exports 入口
      // 使用 no-restricted-imports regex 匹配 specifier 字符串，不依赖 resolver
      // NOTE: 每个包的 per-package config 也包含此规则，以防被后续 config 块覆盖
      'no-restricted-imports': [
        'error',
        {
          patterns: [DEEP_PATH_PATTERN],
        },
      ],
    },
  },

  {
    files: ['packages/{api,core}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': boundaryRule([
        { regex: '^@rss/', message: 'Shared packages cannot depend on apps or each other.' },
      ]),
    },
  },
  {
    files: ['packages/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [{ regex: '^@rss/', message: 'Core owns presentation only.' }],
        [NO_AXIOS_PATH],
      ),
    },
  },
  // ── 测试文件: 豁免特定规则 ────────────────────────────────────────────────
  {
    files: ['**/*.spec.{ts,tsx}'],
    rules: {
      // vitest importOriginal<typeof import('...')>() 语法触发 consistent-type-imports。
      // 豁免原因：vitest mock 工厂泛型参数必须用 import() 类型表达式，无法改写为 import type。
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },

  // ── vite.config.ts + tsconfig.node.json 覆盖范围的配置文件 ────────────────
  // vite.config.ts 由 tsconfig.node.json 覆盖，不被 tsconfig.json 包含。
  // 关闭 type-aware 规则，避免 "no tsconfig includes this file" 解析错误。
  {
    files: ['**/vite.config.ts'],
    languageOptions: {
      parserOptions: {
        project: null, // 不使用 type-aware project
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // The application owns one same-origin Identity session.
  {
    files: ['apps/identity/**/*.{js,ts,tsx}'],
    plugins: {
      'identity-boundary': {
        rules: {
          contained: {
            meta: {
              type: 'problem',
              schema: [],
              messages: {
                escape:
                  'Identity relative imports must stay inside apps/identity; use approved public package exports.',
              },
            },
            create(context) {
              function check(node) {
                const value = node.value
                if (typeof value !== 'string' || !value.startsWith('.')) return
                const filename = context.filename
                const marker = `${sep}apps${sep}identity${sep}`
                const index = filename.lastIndexOf(marker)
                const root = filename.slice(0, index) + marker
                const target = resolve(dirname(filename), value)
                const buildHelper =
                  ['vite.config.ts', 'vitest.config.ts'].includes(path.basename(filename)) &&
                  target === resolve(__dirname, 'build/antd-styles')
                if (!target.startsWith(root) && !buildHelper)
                  context.report({ node, messageId: 'escape' })
              }
              return {
                ImportDeclaration: (node) => check(node.source),
                ExportNamedDeclaration: (node) => {
                  if (node.source) check(node.source)
                },
                ExportAllDeclaration: (node) => check(node.source),
                ImportExpression: (node) => check(node.source),
              }
            },
          },
        },
      },
    },
    rules: {
      'identity-boundary/contained': 'error',
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@rss/(?!core(?:/|$)|auth-core$|auth-http$|api/identity$)',
            message: 'Identity app uses only core UI and its dedicated Identity transport.',
          },
        ],
        [NO_AXIOS_PATH],
      ),
      'no-restricted-globals': ['error', ...NO_NETWORK],
      'no-restricted-properties': ['error', ...NO_NETWORK_PROPERTIES],
    },
  },

  {
    files: ['apps/identity/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@rss/(?!core(?:/|$)|auth-core$|auth-http$|api/(?:identity|testing)$)',
            message: 'Tests use public UI/Identity exports and sanitized failures only.',
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },
  {
    files: ['packages/device-access/src/clients/live.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='request'], CallExpression[callee.type='MemberExpression'][callee.computed=true][callee.property.value='request']",
          message: 'Production MDM HTTP calls must use generated operations.',
        },
      ],
    },
  },
  // ── Prettier: 放最后关闭格式类规则，交给 prettier ─────────────────────────
  configPrettier,
  {
    files: ['apps/ui-preview/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@rss/(?!core(?:/|$))',
            message: 'Component preview consumes presentation only.',
          },
        ],
        [NO_AXIOS_PATH],
      ),
      'no-restricted-globals': ['error', ...NO_NETWORK],
      'no-restricted-properties': ['error', ...NO_NETWORK_PROPERTIES],
    },
  },
  {
    files: ['apps/device-access/**/*.{ts,tsx}', 'packages/device-access/**/*.{ts,tsx}'],
    plugins: {
      'da-boundary': {
        rules: {
          contained: {
            meta: {
              type: 'problem',
              schema: [],
              messages: {
                boundary:
                  'DA imports must stay in their owner and use public exports; production cannot import demo.',
              },
            },
            create(context) {
              return {
                ImportDeclaration: (node) => check(node.source),
                ExportNamedDeclaration: (node) => {
                  if (node.source) check(node.source)
                },
                ExportAllDeclaration: (node) => check(node.source),
                ImportExpression: (node) => check(node.source),
              }
              function check(node) {
                if (typeof node.value !== 'string' || !node.value.startsWith('.')) return
                const filename = context.filename,
                  marker = filename.includes(`${sep}apps${sep}device-access${sep}`)
                    ? `${sep}apps${sep}device-access${sep}`
                    : `${sep}packages${sep}device-access${sep}`
                const root = filename.slice(0, filename.lastIndexOf(marker)) + marker,
                  target = resolve(dirname(filename), node.value)
                const buildHelper =
                  ['vite.config.ts', 'vitest.config.ts'].includes(path.basename(filename)) &&
                  target === resolve(__dirname, 'build/antd-styles')
                if (
                  (!target.startsWith(root) && !buildHelper) ||
                  (filename.startsWith(root + 'src' + sep) &&
                    !filename.endsWith('.spec.ts') &&
                    (target === root + 'demo' || target.startsWith(root + 'demo' + sep)))
                )
                  context.report({ node, messageId: 'boundary' })
              }
            },
          },
        },
      },
    },
    rules: {
      'da-boundary/contained': 'error',
      'no-restricted-imports': boundaryRule(
        [
          {
            regex:
              '^@rss/(?!core(?:/|$)|auth-core$|auth-http$|device-access/(?:client|model|components)$|api/(?:identity|mdm|device-access)$)',
            message: 'Use public DA and authentication boundaries.',
          },
        ],
        [NO_AXIOS_PATH],
      ),
      'no-restricted-globals': ['error', ...NO_NETWORK],
      'no-restricted-properties': ['error', ...NO_NETWORK_PROPERTIES],
    },
  },
  {
    files: ['packages/device-access/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex:
              '^@rss/(?!api/(?:identity|mdm|mdm-query|mdm-operations|mdm-types|mdm-validators|mdm-schemas)$)',
            message: 'The domain owns no session or application composition.',
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },
  {
    files: ['apps/device-access/src/**/*.{ts,tsx}'],
    ignores: [
      'apps/device-access/src/main.ts',
      'apps/device-access/src/main.tsx',
      'apps/device-access/src/runtime.ts',
      'apps/device-access/src/bootstrap.ts',
      'apps/device-access/src/bootstrap.tsx',
      '**/*.spec.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex:
              '^@rss/(?!core$|auth-core$|device-access/(?:client|model|components)$|api/(?:identity|mdm|mdm-query|mdm-operations|mdm-types|mdm-validators|mdm-schemas)$)',
            message: 'Features consume injected clients.',
          },
        ],
        [
          NO_AXIOS_PATH,
          {
            name: '@rss/auth-core',
            importNames: ['createSession', 'createFlows'],
            message: 'Only bootstrap assembles authentication.',
          },
        ],
      ),
    },
  },
  {
    files: ['apps/device-access/demo/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex:
              '^@rss/(?!core$|auth-core$|auth-http$|device-access/(?:client|model)$|api/(?:identity|mdm|mdm-query|mdm-filter|device-access-demo)$)',
            message: 'Demo is explicit and uses the existing executor.',
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },
  {
    files: ['apps/device-access/**/*.spec.ts', 'packages/device-access/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex:
              '^@rss/(?!core$|auth-core$|auth-http$|device-access/(?:client|model|components)$|api/(?:identity|mdm|testing|mdm-operations|mdm-types|mdm-validators|mdm-schemas)$)',
            message: 'Tests use declared public boundaries.',
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },
  {
    files: [
      'apps/mdm/**/*.{ts,tsx}',
      'packages/{auth-core,auth-http,mdm-http,mdm-authorization,mdm-tenant-administration,mdm-user-profiles,mdm-devices,mdm-enrollment,mdm-connections,mdm-inventory,mdm-policies,mdm-scopes,mdm-groups,mdm-compliance,mdm-resources,mdm-content,mdm-software,mdm-certificates,mdm-recovery-credentials,mdm-audit,mdm-webhooks,mdm-execution,mdm-device-access,mdm-telemetry,mdm-tenant-setup,mdm-runtime-diagnostics}/**/*.ts',
    ],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: {
      'react-boundary': {
        rules: {
          contained: {
            meta: {
              type: 'problem',
              schema: [],
              messages: {
                escape: 'Use declared public exports; relative imports must stay with their owner.',
              },
            },
            create(context) {
              function check(node) {
                if (typeof node.value !== 'string' || !node.value.startsWith('.')) return
                const relative = path.relative(__dirname, context.filename)
                const owner = relative.split(sep).slice(0, 2).join(sep)
                const root = resolve(__dirname, owner) + sep
                if (!resolve(dirname(context.filename), node.value).startsWith(root))
                  context.report({ node, messageId: 'escape' })
              }
              return {
                ImportDeclaration: (node) => check(node.source),
                ExportNamedDeclaration: (node) => {
                  if (node.source) check(node.source)
                },
                ExportAllDeclaration: (node) => check(node.source),
                ImportExpression: (node) => check(node.source),
              }
            },
          },
        },
      },
    },
    rules: {
      'react-boundary/contained': 'error',
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@rss/core(?:/|$)',
            message:
              'React MDM uses its own composition and framework-independent domain packages.',
          },
        ],
        [NO_AXIOS_PATH],
      ),
      'no-restricted-globals': ['error', ...NO_NETWORK],
      'no-restricted-properties': ['error', ...NO_NETWORK_PROPERTIES],
    },
  },
  {
    files: [
      'packages/{auth-core,mdm-authorization,mdm-tenant-administration,mdm-user-profiles,mdm-devices,mdm-enrollment,mdm-connections,mdm-tenant-setup,mdm-runtime-diagnostics}/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': boundaryRule([
        {
          regex: '^(?:@rss/|react(?:/|$)|antd(?:/|$)|axios$)',
          message: 'Domain cores depend only on their own models and ports.',
        },
      ]),
    },
  },
  {
    files: ['packages/mdm-inventory/**/*.ts'],
    rules: {
      'no-restricted-imports': boundaryRule([
        {
          regex: '^(?:@rss/(?!mdm-devices$)|react(?:/|$)|antd(?:/|$)|axios$)',
          message: 'Inventory consumes only the existing pure device identity and value models.',
        },
      ]),
    },
  },
  {
    files: [
      'packages/{mdm-policies,mdm-scopes,mdm-groups,mdm-compliance,mdm-certificates,mdm-recovery-credentials,mdm-audit,mdm-webhooks,mdm-execution,mdm-device-access,mdm-telemetry,mdm-tenant-setup,mdm-runtime-diagnostics}/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': boundaryRule([
        {
          regex: '^(?:@rss/(?!mdm-devices$|mdm-inventory$)|react(?:/|$)|antd(?:/|$)|axios$)',
          message: 'These domain cores consume only pure device and inventory models.',
        },
      ]),
    },
  },
  {
    files: ['packages/{mdm-resources,mdm-software}/**/*.ts'],
    rules: {
      'no-restricted-imports': boundaryRule([
        {
          regex:
            '^(?:@rss/(?!mdm-devices$|mdm-inventory$|mdm-resources$)|react(?:/|$)|antd(?:/|$)|axios$)',
          message:
            'Resource and software cores consume only existing pure resource, inventory and device models.',
        },
      ]),
    },
  },
  {
    files: ['packages/mdm-content/**/*.ts'],
    rules: {
      'no-restricted-imports': boundaryRule([
        {
          regex: '^(?:@rss/(?!mdm-resources$|mdm-inventory$)|react(?:/|$)|antd(?:/|$)|axios$)',
          message:
            'Content owns transfer protocols and consumes only pure material coordinates and validators.',
        },
      ]),
    },
  },
  {
    files: ['packages/{auth-http,mdm-http}/**/*.ts'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex:
              '^(?:react(?:/|$)|antd(?:/|$)|@rss/(?!auth-core$|mdm-authorization$|mdm-tenant-administration$|mdm-user-profiles$|mdm-devices$|mdm-enrollment$|mdm-connections$|mdm-inventory$|mdm-policies$|mdm-scopes$|mdm-groups$|mdm-compliance$|mdm-resources$|mdm-content$|mdm-software(?:/publications)?$|mdm-certificates/(?:device-pki|archive)$|mdm-recovery-credentials$|mdm-audit$|mdm-webhooks$|mdm-execution$|mdm-device-access$|mdm-tenant-setup$|mdm-runtime-diagnostics$|mdm-telemetry$|api/))',
            message: 'Adapters depend only on core ports and the API executor.',
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },
  {
    files: ['packages/auth-http/**/*.ts'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^(?:react(?:/|$)|antd(?:/|$)|@rss/(?!auth-core$|api/(?:identity|testing)$))',
            message: 'Identity adapters consume only their auth core and Identity executor.',
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },
  {
    files: ['apps/mdm/src/**/*.{ts,tsx}'],
    ignores: ['apps/mdm/src/runtime.ts', '**/*.spec.ts'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex:
              '^(?:@rss/(?!api/mdm-filter$|auth-core$|auth-http$|mdm-authorization$|mdm-tenant-administration$|mdm-user-profiles$|mdm-devices$|mdm-enrollment$|mdm-connections$|mdm-inventory$|mdm-policies$|mdm-scopes$|mdm-groups$|mdm-compliance$|mdm-resources$|mdm-content$|mdm-software(?:/publications)?$|mdm-certificates/(?:device-pki|archive)$|mdm-recovery-credentials$|mdm-audit$|mdm-webhooks$|mdm-execution$|mdm-device-access$|mdm-tenant-setup$|mdm-runtime-diagnostics$|mdm-telemetry$))',
            message: 'Feature pages consume domain use cases; only runtime assembles adapters.',
          },
        ],
        [
          NO_AXIOS_PATH,
          {
            name: '@rss/auth-core',
            importNames: ['createSession', 'createFlows'],
            message: 'Only runtime creates the session and flow owner.',
          },
          {
            name: '@rss/auth-http',
            importNames: [
              'createAuthPort',
              'createIdentityTransport',
              'createPasskeyClient',
              'createIdentityAdministrationAdapter',
            ],
            message: 'Only runtime assembles Identity adapters.',
          },
        ],
      ),
    },
  },
)
