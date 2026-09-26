import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import pluginImportX from 'eslint-plugin-import-x'
import pluginA11y from 'eslint-plugin-vuejs-accessibility'
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
      'docs/design/**/*.jsx', // 设计稿 JSX 非源码
      '**/node_modules/**',
    ],
  },

  // ── Base JS recommended ─────────────────────────────────────────────────────
  js.configs.recommended,

  // ── TypeScript recommended ──────────────────────────────────────────────────
  ...tseslint.configs.recommended,

  // ── Vue flat/recommended (covers .vue files) ────────────────────────────────
  ...pluginVue.configs['flat/recommended'],

  // ── Global settings for all TS/Vue files ────────────────────────────────────
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        project: true,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      'import-x': pluginImportX,
      'vuejs-accessibility': pluginA11y,
    },
    settings: {
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

      // ── Vue ───────────────────────────────────────────────────────────────
      'vue/multi-word-component-names': 'off', // barrel index files 豁免
      'vue/block-lang': [
        'error',
        {
          script: { lang: 'ts' },
        },
      ],
      'vue/component-api-style': ['error', ['script-setup']], // 强制 <script setup>
      'vue/define-macros-order': [
        'error',
        { order: ['defineProps', 'defineEmits', 'defineSlots'] },
      ],

      // ── Vue <script setup> 已知误报规则 ──────────────────────────────────
      // vue/no-dupe-keys: <script setup> 中 ref/reactive 变量在模板也可见，规则误
      // 报重复 key；此规则仅对 Options API 有意义，setup 模式关闭。
      // 豁免原因：误报率 100%（所有 <script setup> 文件），无实际拦截价值。
      'vue/no-dupe-keys': 'off',
      // vue/require-default-prop: TypeScript 定义的可选 prop（prop?: T）已明确表达
      // 可选性，无需额外 default value；此规则对 TS typed props 有 100% 误报率。
      'vue/require-default-prop': 'off',

      // ── a11y ──────────────────────────────────────────────────────────────
      ...pluginA11y.configs['flat/recommended'].rules,

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
    files: ['packages/{api,core}/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': boundaryRule([
        { regex: '^@rss/', message: 'Shared packages cannot depend on apps or each other.' },
      ]),
    },
  },
  {
    files: ['packages/core/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [{ regex: '^@rss/', message: 'Core owns presentation only.' }],
        [NO_AXIOS_PATH],
      ),
    },
  },
  // ── 测试文件: 豁免特定规则 ────────────────────────────────────────────────
  {
    files: ['**/*.spec.ts'],
    rules: {
      // vitest importOriginal<typeof import('...')>() 语法触发 consistent-type-imports。
      // 豁免原因：vitest mock 工厂泛型参数必须用 import() 类型表达式，无法改写为 import type。
      '@typescript-eslint/consistent-type-imports': 'off',
      // 测试文件需要定义多个内联 fixture 组件，one-component-per-file 100% 误报。
      'vue/one-component-per-file': 'off',
      // 测试 fixture 的 Options API 组件 components/setup 顺序不关键。
      'vue/order-in-components': 'off',
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
    files: [
      'apps/identity/**/*.{js,ts,vue}',
      'packages/auth/**/*.{js,ts,vue}',
      'apps/mdm/**/*.{js,ts,vue}',
    ],
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
                const marker = filename.includes(`${sep}packages${sep}auth${sep}`)
                  ? `${sep}packages${sep}auth${sep}`
                  : filename.includes(`${sep}apps${sep}mdm${sep}`)
                    ? `${sep}apps${sep}mdm${sep}`
                    : `${sep}apps${sep}identity${sep}`
                const index = filename.lastIndexOf(marker)
                const root = filename.slice(0, index) + marker
                if (!resolve(dirname(filename), value).startsWith(root))
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
            regex: '^@rss/(?!core(?:/|$)|auth(?:/|$)|api/identity$)',
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
    files: ['apps/identity/**/*.spec.ts', 'packages/auth/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@rss/(?!core(?:/|$)|auth(?:/|$)|api/(?:identity|testing)$)',
            message: 'Tests use public UI/Identity exports and sanitized failures only.',
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },
  {
    files: ['apps/mdm/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@rss/(?!core(?:/|$)|auth(?:/|$)|api/(?:identity|mdm|mdm-limits)$)',
            message: 'Use public product boundaries.',
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },
  {
    files: ['apps/mdm/src/**/*.{ts,vue}'],
    ignores: ['apps/mdm/src/main.ts', 'apps/mdm/src/bootstrap.ts', '**/*.spec.ts'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@rss/(?!core(?:/|$)|auth$|api/(?:mdm|mdm-limits)$)',
            message: 'Features consume injected clients and public UI.',
          },
        ],
        [
          NO_AXIOS_PATH,
          {
            name: '@rss/auth',
            importNames: ['createSession', 'createApi', 'createFlows', 'identityRouter'],
            message: 'Only bootstrap assembles authentication.',
          },
          {
            name: '@rss/api/mdm',
            importNames: ['createMdmTransport'],
            message: 'Only bootstrap assembles the business transport.',
          },
        ],
      ),
    },
  },
  {
    files: ['apps/mdm/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@rss/(?!core(?:/|$)|auth(?:/|$)|api/(?:identity|mdm|testing)$)',
            message: 'Tests use public product exports and sanitized failures only.',
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },
  // ── Prettier: 放最后关闭格式类规则，交给 prettier ─────────────────────────
  configPrettier,
)
