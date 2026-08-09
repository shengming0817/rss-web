# @gocell/core

> 对应后端 cell：无（设计系统 / 基础设施层，无业务逻辑）

## 对外 exports

- `.` → `src/index.ts` — 所有公开 Composable + Store + PDP 契约 + Shell UI + i18n 工厂汇总
- `./composables` → `src/composables/index.ts` — Composable 子入口
- `./stores` → `src/stores/index.ts` — Pinia store 子入口（`useThemeStore`、`useLocaleStore`）
- `./components` → `src/components/index.ts` — UI 组件子入口（`Can`、`UnavailablePanel`、`ModalShell`）
- `./ui` → `src/ui/index.ts` — Shell 布局组件（`AppShell`、`Sidebar`、`TopBar`、`CommandPalette`、`AIBottomBar`）+ `NAV_GROUPS`
- `./i18n` → `src/i18n/index.ts` — i18n 工厂（`createGocellI18n`）+ `syncI18nLocale`
- `./styles/tokens.css` → `src/styles/tokens.css` — 设计 token（oklch，亮/暗双主题）
- `./styles/v1-linear.scss` → `src/styles/v1-linear.scss` — V1 Linear 风格全局 SCSS 层

## 提供给其他包的能力

| 导出 | 签名 | 用途 |
|---|---|---|
| `AppShell` | Vue SFC | 根布局：sidebar 232px + topbar 44px + 内容区 + AIBottomBar |
| `Sidebar` | Vue SFC | 侧边栏：品牌区 / 搜索 / NAV_GROUPS 导航 / 用户卡；支持折叠 |
| `TopBar` | Vue SFC | 顶栏：面包屑 + 主题切换 + 语言切换 + ⌘K |
| `CommandPalette` | Vue SFC | ⌘K 命令面板（壳）：搜索 input + focus trap + Esc 关闭 |
| `AIBottomBar` | Vue SFC | AI 底栏占位（32px strip，三段展开架构已预留） |
| `NAV_GROUPS` | `NavGroup[]` const | 类型化导航配置（5 组，labelKey 走 i18n，pill 状态） |
| `createGocellI18n` | `() => I18n` | vue-i18n 11 工厂（composition mode，zh-CN/en-US，fallback zh-CN） |
| `syncI18nLocale` | `(i18n, localeStore) => void` | 将 useLocaleStore 变化同步至 vue-i18n global locale |
| `useLocaleStore` | Pinia store `core.locale` | locale 状态（`'zh-CN' | 'en-US'`），持久化至 `gocell-locale` key |
| `useThemeStore` | Pinia store `core.theme` | 主题状态单一来源；持有 `theme` ref + `setTheme`/`toggleTheme` |
| `useTheme` | `() => { theme, setTheme, toggleTheme }` | `useThemeStore` 的薄封装 |
| `useThemeTokens` | `() => { themeConfig: ComputedRef<ThemeConfig> }` | 读 CSS 变量映射为 AntD seed token |
| `PDP_INJECTION_KEY` | `InjectionKey<PdpClient>` | Vue inject key |
| `PdpClient` | interface（类型） | PDP client 契约 |
| `useDecision` | `(action, resource?) => ComputedRef<boolean>` | 响应式权限判断 |
| `Can` | Vue SFC 组件 | 授权 UI 壳 |
| `UnavailablePanel` | Vue SFC 组件 | 降级面板：后端不可用时展示标题 + 消息 |
| `useRovingTablist` | `(options) => { ... }` | Roving tabindex Composable：键盘方向键导航 tablist |

## i18n 消息命名空间

| 前缀 | 用途 |
|---|---|
| `nav.*` | 导航 group label + item label + pill 标签 |
| `shell.*` | 面包屑 / 品牌 / 搜索 / 主题 / 语言 / 用户卡 |
| `command.*` | 命令面板占位文案 |
| `errors.*` | 错误码对照（key = `errors.<CODE>`） |

业务页面文案逐 batch 补充（在对应 `packages/<cell>` 内扩展），不在 core 内硬编。

## 依赖的 contract

无（@gocell/core 不依赖 @gocell/contracts）

## 边界

- 只依赖 `@gocell/shared`（如需）、Vue、Vue Router、Pinia、ant-design-vue、vue-i18n
- 不依赖任何业务 cell（`access` / `audit` / `config` / `observability` / `devboard`）
- 跨包仅经 `@gocell/contracts` 类型 + `@gocell/request` client，禁深路径 import

## 测试

```
pnpm -F @gocell/core test --run
pnpm -F @gocell/core test:coverage
```

覆盖率门槛：lines/statements/functions ≥ 90%，branches ≥ 88%（v8 在 Vue template v-if 链和 TS `as const` 数据文件上存在不可覆盖的人工分支；real 分支覆盖率 ≥ 90%）

## 维护者

ghbvf（项目负责人）
