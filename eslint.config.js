/**
 * ESLint flat config — rss-web
 * AI-robust Hard: 边界锁 (T022)
 *
 * ── 边界锁方案说明 ────────────────────────────────────────────────────────────
 * 之前使用 import-x/no-restricted-paths zones，该方案依赖 resolver 把 import
 * specifier 解析到物理路径，在 pnpm 严格 node_modules 下，被禁的包若未声明为
 * target 包的依赖，resolver 解析失败 → 规则静默放过（fail-open），边界锁全部失效。
 *
 * 新方案：全部改用 no-restricted-imports 的 patterns（regex 匹配 import specifier
 * 字符串），不依赖 resolver，不受物理路径解析影响。每个包独立一个 files-scoped 配置。
 *
 * 注意：在 ESLint flat config 中，当多个 config 块匹配同一文件时，同名规则以最后
 * 一个 config 块的配置为准（覆盖而非合并）。因此每个包的 config 块必须包含该包
 * 所有适用的 no-restricted-imports 规则（深路径 + 横向 + 反向 + axios），且放在
 * 最后，避免被后续 config 块覆盖。
 *
 * ── BLIND SPOTS (ai-robust §盲区自检，此规则不覆盖的形态) ──────────────────────
 * 1. 运行时动态 `import(someVar)` — AST 无法静态析出目标路径，无法拦截
 * 2. 字符串拼接路径 `require('./pkg/' + name)` — 同上，动态形态无法拦截
 * 3. `type-only import` (import type { … } from '…') — no-restricted-imports
 *    默认也拦截 type-only；若需豁免须在消费侧加 eslint-disable（当前无需豁免）
 * 4. Re-export 转发：A 从 B 导出，C import A 再转发 B 的内容 — 规则看 specifier
 *    字符串，转发后的 consumer 侧不受约束（已知盲区，需 review 补偿）
 * 5. 相对路径绕过：`import '../../packages/audit/src/x'` — monorepo 内相对路径
 *    跨包在实践中不可达（tsconfig paths 不做这种映射），可接受
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 反向自检测试：eslint.config.spec.ts (vitest, ESLint Node API)
 * 合规代码 → 0 boundary error; 违规代码 fixture → 被对应 ruleId 报错
 */

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import pluginImportX from 'eslint-plugin-import-x'
import pluginA11y from 'eslint-plugin-vuejs-accessibility'
import configPrettier from 'eslint-config-prettier'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Shared patterns (included in every per-package config) ──────────────────
// These patterns apply universally. Each per-package config MUST include them
// to avoid being overridden by a later config block that only has these.

/** Deep-path ban: all packages must use package.json#exports, not src/ paths */
const DEEP_PATH_PATTERN = {
  regex: '^@rss/[^/]+/src/',
  message:
    '深路径 import 被禁止。请只用 package.json#exports 暴露的入口。参见 AGENTS.md 和 CLAUDE.md。',
}

/** Reverse-dependency ban: no package/* or tools/* may import the app layer */
const NO_WEB_PATTERN = {
  regex: '^@rss/web(/|$)',
  message:
    'packages/* 和 tools/* 禁止反向 import @rss/web（应用层）。参见 AGENTS.md 和 CLAUDE.md。',
}

/** Axios ban: only @rss/api may import axios */
const NO_AXIOS_PATH = {
  name: 'axios',
  message: 'HTTP 单点：禁止在业务包直接 import axios。请通过 @rss/api 的 transport 发请求。',
}

const INTERNAL_ENDPOINT_PATTERN = {
  regex: '^@rss/api/(?:endpoints/|session$|testing$)',
  message:
    '应用层禁止绕过 domain adapter 使用 endpoint coordinates、session capability 或测试工厂。',
}

const APP_TEST_INTERNAL_PATTERN = {
  regex: '^@rss/api/(?:endpoints/|session$)',
  message: '应用测试不得绕过 domain adapter 使用 endpoint coordinates 或 session capability。',
}

const PREVIEW_AUTHORIZATION_PATTERN = {
  regex: '^@rss/authorization/preview$',
  message:
    '生产应用禁止导入 UX-only Preview authorization。Preview 只能由后续显式 dev/test/demo composition owner 启用。',
}

const RELEASE_LEDGER_IMPORT_PATTERN = {
  regex: '(?:^|/)docs/contracts/20260812-rss-release-baseline(?:\\.json)?$',
  message: 'The release ledger is production-excluded; app code may consume only sealed scalars.',
}

const STATIC_DIAGNOSTICS_DEPENDENCY_PATTERN = {
  regex: '^@rss/(?:api|audit|authorization|identity|runtime|settings)(?:/|$)',
  message:
    'Static release diagnostics cannot import transport, session, domain, authorization, or runtime discovery seams.',
}

const NO_RELATIVE_RELEASE_META_PATTERN = {
  regex: '^\\.',
  message: 'Release metadata must remain a leaf over sealed source constants.',
}

const ABOUT_RELEASE_META_ONLY_PATTERN = {
  regex: '^(?!\\.\\./release-meta$)\\.',
  message: 'About may consume only the injected release metadata module.',
}

const DEGRADED_LOCAL_IMPORTS_ONLY_PATTERN = {
  regex: '^(?!\\./(?:error-presentation|ErrorPage\\.vue|SourceBadge\\.vue)$)\\.',
  message: 'DegradedState may import only its three reviewed local presentation modules.',
}

const NO_STATIC_DIAGNOSTICS_NETWORK = [
  { name: 'fetch', message: 'Static release diagnostics cannot access the network.' },
  { name: 'XMLHttpRequest', message: 'Static release diagnostics cannot access the network.' },
  { name: 'WebSocket', message: 'Static release diagnostics cannot access the network.' },
  { name: 'EventSource', message: 'Static release diagnostics cannot access the network.' },
]

const NO_STATIC_DIAGNOSTICS_NETWORK_PROPERTIES = [
  { object: 'globalThis', property: 'fetch', message: 'Static release diagnostics are offline.' },
  { object: 'window', property: 'fetch', message: 'Static release diagnostics are offline.' },
  {
    object: 'navigator',
    property: 'sendBeacon',
    message: 'Static release diagnostics are offline.',
  },
]

/** Helper: create a no-restricted-imports rule config combining all given patterns + paths */
function boundaryRule(extraPatterns = [], extraPaths = []) {
  return [
    'error',
    {
      patterns: [DEEP_PATH_PATTERN, NO_WEB_PATTERN, ...extraPatterns],
      paths: [...extraPaths],
    },
  ]
}

function staticDiagnosticsImportRule(relativePattern) {
  return [
    'error',
    {
      patterns: [
        DEEP_PATH_PATTERN,
        INTERNAL_ENDPOINT_PATTERN,
        PREVIEW_AUTHORIZATION_PATTERN,
        STATIC_DIAGNOSTICS_DEPENDENCY_PATTERN,
        relativePattern,
      ],
      paths: [NO_AXIOS_PATH],
    },
  ]
}

export default tseslint.config(
  // ── Global ignores ──────────────────────────────────────────────────────────
  {
    ignores: [
      '**/dist/**',
      '**/dist-preview-demo/**',
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

  // ── 边界锁: packages/shared ────────────────────────────────────────────────
  // 禁止 import 任何 @rss/*（包括 api、core）
  {
    files: ['packages/shared/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': boundaryRule([
        {
          regex: '^@rss/',
          message: '@rss/shared 不允许依赖任何 @rss/* 包。参见 AGENTS.md 和 CLAUDE.md。',
        },
      ]),
    },
  },

  // ── 边界锁: packages/core ──────────────────────────────────────────────────
  // 纯 UI 基座只允许依赖 shared；HTTP 由应用层经 api 使用。
  {
    files: ['packages/core/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': boundaryRule([
        {
          regex: '^@rss/(?!shared(?:/|$))',
          message: '@rss/core 只允许依赖 @rss/shared。',
        },
      ]),
    },
  },

  // ── 边界锁: packages/api ──────────────────────────────────────────────────
  // api 只允许依赖 shared；api 是 HTTP 单点，允许 import axios。
  {
    files: ['packages/api/**/*.ts'],
    rules: {
      'no-restricted-imports': boundaryRule([
        {
          regex: '^@rss/(?!shared(?:/|$))',
          message: '@rss/api 只允许依赖 @rss/shared。',
        },
      ]),
    },
  },

  // ── 边界锁: packages/identity ─────────────────────────────────────────────
  // identity 默认只依赖 api seam；endpoint subpath 是其唯一 raw-coordinate owner。
  {
    files: ['packages/identity/**/*.ts'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@rss/(?!api(?:$|/endpoints/identity$))',
            message: '@rss/identity 默认只允许依赖 @rss/api 与 Identity endpoint。',
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },

  // Runtime and Audit are framework-neutral domain adapters. Their exact endpoint
  // subpaths are the sole raw-coordinate owners for these domains.
  {
    files: ['packages/runtime/**/*.ts'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@rss/(?!api(?:$|/endpoints/runtime$))',
            message: '@rss/runtime 只允许依赖 @rss/api 与 Runtime endpoint。',
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },
  {
    files: ['packages/audit/**/*.ts'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@rss/(?!api(?:$|/endpoints/audit$))',
            message: '@rss/audit 只允许依赖 @rss/api 与 Audit endpoint。',
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },
  {
    files: ['packages/settings/**/*.ts'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@rss/(?!(?:api(?:$|/endpoints/settings$)|shared$))',
            message:
              '@rss/settings 只允许依赖 @rss/api、Settings endpoint 与 sealed source metadata。',
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },
  {
    files: ['packages/settings/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@rss/(?!(?:api(?:$|/endpoints/settings$|/session$|/testing$)|shared$))',
            message:
              '@rss/settings 测试只允许依赖 API seam、Settings endpoint、sealed source metadata 与测试 capability。',
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },

  // ── 边界锁: packages/authorization ───────────────────────────────────────
  // UX hint capability is framework-neutral and has zero runtime dependencies.
  {
    files: ['packages/authorization/**/*.ts'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@rss/',
            message: '@rss/authorization 不允许依赖其它 @rss/* 包。',
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },

  // The bearer/recovery capability has exactly one production owner.
  {
    files: ['packages/identity/src/session/controller.ts'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@rss/(?!api(?:$|/endpoints/identity$|/session$))',
            message: 'Identity session controller 只允许依赖 API seam 与 session capability。',
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },

  // Identity behavior tests may mint the real sanitized error class. Production
  // sources remain unable to import the test-only factory.
  {
    files: ['packages/identity/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@rss/(?!api(?:$|/endpoints/identity$|/testing$))',
            message: '@rss/identity 测试只允许依赖 API seam 与测试工厂。',
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },

  // ── 边界锁: apps/web ──────────────────────────────────────────────────────
  // apps/web 可依赖所有 @rss/* 包；但禁深路径和 axios
  {
    files: ['apps/web/**/*.{js,mjs,cjs,ts,tsx,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            DEEP_PATH_PATTERN,
            INTERNAL_ENDPOINT_PATTERN,
            PREVIEW_AUTHORIZATION_PATTERN,
            RELEASE_LEDGER_IMPORT_PATTERN,
          ],
          paths: [NO_AXIOS_PATH],
        },
      ],
    },
  },

  // App behavior tests may mint sanitized errors; production sources cannot.
  {
    files: ['apps/web/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [DEEP_PATH_PATTERN, APP_TEST_INTERNAL_PATTERN],
          paths: [NO_AXIOS_PATH],
        },
      ],
    },
  },

  // About and its build metadata input are static presentation only. Import
  // boundaries prevent a domain/runtime client from becoming a second diagnostics seam;
  // global guards close direct browser-network bypasses.
  {
    files: ['apps/web/src/release-meta.ts'],
    rules: {
      'no-restricted-imports': staticDiagnosticsImportRule(NO_RELATIVE_RELEASE_META_PATTERN),
      'no-restricted-globals': ['error', ...NO_STATIC_DIAGNOSTICS_NETWORK],
      'no-restricted-properties': ['error', ...NO_STATIC_DIAGNOSTICS_NETWORK_PROPERTIES],
    },
  },
  {
    files: ['apps/web/src/views/AboutView.vue'],
    rules: {
      'no-restricted-imports': staticDiagnosticsImportRule(ABOUT_RELEASE_META_ONLY_PATTERN),
      'no-restricted-globals': ['error', ...NO_STATIC_DIAGNOSTICS_NETWORK],
      'no-restricted-properties': ['error', ...NO_STATIC_DIAGNOSTICS_NETWORK_PROPERTIES],
    },
  },

  // The shared degraded presenter remains a pure UI emitter. Domain operations
  // continue to own request, retry, abort, and generation state.
  {
    files: ['packages/core/src/components/DegradedState.vue'],
    rules: {
      'no-restricted-imports': boundaryRule([
        {
          regex: '^@rss/(?!shared(?:/|$))',
          message: 'DegradedState can depend only on sealed source metadata.',
        },
        DEGRADED_LOCAL_IMPORTS_ONLY_PATTERN,
      ]),
      'no-restricted-globals': ['error', ...NO_STATIC_DIAGNOSTICS_NETWORK],
      'no-restricted-properties': ['error', ...NO_STATIC_DIAGNOSTICS_NETWORK_PROPERTIES],
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

  // ── Prettier: 放最后关闭格式类规则，交给 prettier ─────────────────────────
  configPrettier,
)
