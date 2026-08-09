/**
 * ESLint flat config — gocell-web
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
 * 6. `packages/contracts/src/**` 被 ignore，其内部深路径不受 no-internal-modules 检查
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
  regex: '^@gocell/[^/]+/src/',
  message:
    '深路径 import 被禁止。请只用 package.json#exports 暴露的入口（如 @gocell/foo, @gocell/foo/composables）。参见 .claude/rules/gocellweb/package-boundaries.md',
}

/** Reverse-dependency ban: no package/* or tools/* may import the app layer */
const NO_WEB_PATTERN = {
  regex: '^@gocell/web(/|$)',
  message:
    'packages/* 和 tools/* 禁止反向 import @gocell/web（应用层）。参见 .claude/rules/gocellweb/package-boundaries.md',
}

/** Axios ban: only @gocell/request may import axios */
const NO_AXIOS_PATH = {
  name: 'axios',
  message:
    'HTTP 单点：禁止在业务包直接 import axios。请通过 @gocell/request 暴露的 http 实例发请求。',
}

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

/** Message for cross-cell boundary violation */
function cellMsg(from, forbidden) {
  return `@gocell/${from} 禁止 import @gocell/${forbidden}。跨域请走 @gocell/contracts + @gocell/request。参见 .claude/rules/gocellweb/package-boundaries.md`
}

export default tseslint.config(
  // ── Global ignores ──────────────────────────────────────────────────────────
  {
    ignores: [
      'packages/contracts/src/**', // codegen-生成物，不 lint
      'packages/devboard/src/manifest/cells.generated.ts', // cell-manifest 生成物，不 lint
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
      // 禁止 @gocell/*/src/** 深路径，强制走 package.json#exports 入口
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
  // 禁止 import 任何 @gocell/*（包括 contracts、core、request）
  {
    files: ['packages/shared/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': boundaryRule([
        {
          regex: '^@gocell/',
          message:
            '@gocell/shared 不允许依赖任何 @gocell/* 包（含 contracts/core）。参见 .claude/rules/gocellweb/package-boundaries.md',
        },
      ]),
    },
  },

  // ── 边界锁: packages/core ──────────────────────────────────────────────────
  // 禁止 import 业务 cell；允许 contracts/shared/request/vue 等
  {
    files: ['packages/core/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': boundaryRule([
        {
          regex: '^@gocell/(access|audit|config|observability|devboard)(/|$)',
          message:
            '@gocell/core 禁止 import 业务 cell（access/audit/config/observability/devboard）。参见 .claude/rules/gocellweb/package-boundaries.md',
        },
      ]),
    },
  },

  // ── 边界锁: packages/request ──────────────────────────────────────────────
  // 只许 contracts/shared；禁业务 cell + core
  // request 是 HTTP 单点，允许 import axios（不加 NO_AXIOS_PATH）
  {
    files: ['packages/request/**/*.ts'],
    rules: {
      'no-restricted-imports': boundaryRule([
        {
          regex: '^@gocell/(core|access|audit|config|observability|devboard)(/|$)',
          message:
            '@gocell/request 只允许依赖 @gocell/contracts 和 @gocell/shared，禁止 import core/业务 cell。参见 .claude/rules/gocellweb/package-boundaries.md',
        },
      ]),
    },
  },

  // ── 边界锁: packages/access ───────────────────────────────────────────────
  {
    files: ['packages/access/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@gocell/(audit|config|observability|devboard)(/|$)',
            message: cellMsg('access', 'audit/config/observability/devboard'),
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },

  // ── 边界锁: packages/audit ────────────────────────────────────────────────
  {
    files: ['packages/audit/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@gocell/(access|config|observability|devboard)(/|$)',
            message: cellMsg('audit', 'access/config/observability/devboard'),
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },

  // ── 边界锁: packages/config ───────────────────────────────────────────────
  {
    files: ['packages/config/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@gocell/(access|audit|observability|devboard)(/|$)',
            message: cellMsg('config', 'access/audit/observability/devboard'),
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },

  // ── 边界锁: packages/observability ────────────────────────────────────────
  {
    files: ['packages/observability/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@gocell/(access|audit|config|devboard)(/|$)',
            message: cellMsg('observability', 'access/audit/config/devboard'),
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },

  // ── 边界锁: packages/devboard ─────────────────────────────────────────────
  // 设计性例外：devboard 可依赖 access（消费其 PDP client 实现）；<Can>/useDecision 本身来自 @gocell/core
  {
    files: ['packages/devboard/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': boundaryRule(
        [
          {
            regex: '^@gocell/(audit|config|observability)(/|$)',
            message:
              '@gocell/devboard 禁止 import @gocell/audit/config/observability。设计性例外仅 @gocell/access（PDP client 实现；<Can>/useDecision 走 @gocell/core）。参见 .claude/rules/gocellweb/package-boundaries.md',
          },
        ],
        [NO_AXIOS_PATH],
      ),
    },
  },

  // ── 边界锁: packages/contracts ────────────────────────────────────────────
  // contracts/src/** 已在 global ignores 排除（codegen 生成物）
  // 此规则防止手写的非生成文件（如 tests/utils）反向依赖业务包
  {
    files: ['packages/contracts/**/*.ts'],
    rules: {
      'no-restricted-imports': boundaryRule([
        {
          regex: '^@gocell/',
          message:
            '@gocell/contracts 是纯类型包（codegen 派生），禁止 import 任何其他 @gocell/* 包。参见 .claude/rules/gocellweb/package-boundaries.md',
        },
      ]),
    },
  },

  // ── 边界锁: apps/web ──────────────────────────────────────────────────────
  // apps/web 可依赖所有 @gocell/* 包；但禁深路径和 axios
  {
    files: ['apps/web/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [DEEP_PATH_PATTERN],
          paths: [NO_AXIOS_PATH],
        },
      ],
    },
  },

  // ── 边界锁: tools/codegen ─────────────────────────────────────────────────
  // tools 禁止 import 任何 @gocell/* + 反向依赖 @gocell/web
  {
    files: ['tools/**/*.ts'],
    rules: {
      'no-restricted-imports': boundaryRule([
        {
          regex: '^@gocell/',
          message:
            'tools/codegen 禁止 import @gocell/* 包。参见 .claude/rules/gocellweb/package-boundaries.md',
        },
      ]),
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

  // ── tools/codegen vitest.config.ts ────────────────────────────────────────
  {
    files: ['tools/codegen/vitest.config.ts'],
    languageOptions: {
      parserOptions: {
        project: path.resolve(__dirname, 'tools/codegen/tsconfig.json'),
      },
    },
  },

  // ── tools/cell-manifest vitest.config.ts ──────────────────────────────────
  {
    files: ['tools/cell-manifest/vitest.config.ts'],
    languageOptions: {
      parserOptions: {
        project: path.resolve(__dirname, 'tools/cell-manifest/tsconfig.json'),
      },
    },
  },

  // ── Prettier: 放最后关闭格式类规则，交给 prettier ─────────────────────────
  configPrettier,
)
