# PR 拆分 — gocell-web MVP

**原则**：每 PR ≈ 2000 行业务变更（宪法 RL-12）；**骨架 / codegen 生成产物不受限**（标 ⚙️）。
按依赖顺序合入 origin/develop；每 PR 独立绿灯（lint + type + test + codegen diff）方可合。
行数为估算（设计稿 26k+ 行 JSX/CSS，移植时逻辑保留、CSS ~80% 复用）。

| PR | Batch/Story | 标题 | 范围 | 估行 | 依赖 |
|---|---|---|---|---|---|
| **PR-01** ⚙️ | B0/US0 | monorepo 骨架 | 根 package.json + pnpm-workspace(catalog) + tsconfig.base + .npmrc + 9 空包(package.json#exports + tsconfig + index.ts) + apps/web(vite/main/App/空 router) + `.env` | ~1800（骨架不限） | — |
| **PR-02** ⚙️ | B0/US0 | 契约 codegen + 生成类型 | tools/codegen(json2ts) + `pnpm codegen` + 生成 packages/contracts/src/(**只读**) + CI codegen-diff workflow | ~600 手写 + 生成不限 | PR-01 |
| **PR-03** | B0/US0 | 设计 token + 主题桥 | core/styles/tokens.css + v1-linear.scss + useTheme + useThemeTokens + apps/web AntD ConfigProvider(cssVar) | ~2000 | PR-01 |
| **PR-04** | B0/US0 | request + auth + Can | request(axios + setupAxios DI + 单飞刷新 + error→i18n) + access auth store(内存 token) + core `<Can>` 壳 + access useDecision(fail-closed) | ~2000 | PR-02 |
| **PR-05** | B0/US0 | 全局 Layout + i18n | core: AppShell/Sidebar(232,5 组+pill)/TopBar(44)/CommandPalette 壳/AI BottomBar 占位 + i18n(zh/en 框架)+错误码表 | ~2200 | PR-03 |
| **PR-06** | B0/US0 | 守卫 + 快捷键 + 边界 + 测试基建 | 守卫三段 + 快捷键 + ESLint 边界双锁 + husky/lint-staged + vitest workspace + 工厂 + Playwright + CI test | ~1500 | PR-04,05 |
| **PR-07** | B1/US1 | Login + 认证流 | Login 页(oracle-safe)+ login/refresh/logout api + bootstrap 静默 refresh + 守卫接 setup/status + 单测 | ~1800 | PR-06 |
| **PR-08** | B1/US1 | First-run 向导 | 5 步向导(setup/status + setup/admin Basic+body 两层 + 410/409)+ 单测（设计稿 753 行 jsx 移植） | ~2000 | PR-07 |
| **PR-09** | B2/US2 | Identities 列表 | access Identities 列表(user.list)+ 表格/filter/pill + user api(9 契约)+ 单测 | ~1800 | PR-07 |
| **PR-10** | B2/US2 | Identities 操作 | create/edit/change-password modal + lock/unlock + disabled tab 占位 + `<Can>` + 集成测 | ~1500 | PR-09 |
| **PR-11** | B3/US3 | Policies RBAC | Policies `?tab=roles`(role.list + 矩阵 + assign/revoke)+ rules/templates disabled 占位 + 单测 | ~1800 | PR-07 |
| **PR-12** | B3/US3 | Can PDP 接通 | `/access/decide` 接通(stub 标注)+ decisions/reviews 占位 + `<Can>`/useDecision 全测 | ~1200 | PR-04,11 **+ BR-004 §4.1（软：未达用 stub，M1）** |
| **PR-13** | B4/US4 | Audit | audit Audit 页(auditquery: hash chain/分组/actor pill/filter)+ api + 单测（dev-audit 347 行） | ~1800 | PR-07 |
| **PR-14** | B4/US4 | Config | config Config 页(list+edit + stage/publish + 版本 + rollback)+ api + 单测 | ~1800 | PR-07 |
| **PR-15** | B4/US4 | Flags | config Flags 页(bool/variant + rollout% + kill)+ useFlag + 单测 | ~1500 | PR-07,**14**（同属 `@gocell/config`，共享 routes.ts/index.ts 出口 → 串行同一 worktree） |
| **PR-16** | B5/US5 | Cells 列表 + manifest | devboard cell manifest 派生(cell.yaml→JSON)+ Cells 列表(Demo/Durable 徽章)+ 单测 | ~1500 | PR-06 |
| **PR-17** | B5/US5 | Cell detail 壳 + tabs A | detail 多 tab 框架 + Overview/Inventory/Interfaces(ISP4)/Wiring（dev-cell.jsx 1485 移植拆半） | ~2000 | PR-16 |
| **PR-18** | B5/US5 | Cell detail tabs B | Contracts/Dependencies/Tasks/Configuration/Audit/Slices/Groups/AI tab（dev-cell2/3 移植 + 复用 B4 数据） | ~2000 | PR-17（**软依赖 PR-13/14**：仅 Audit/Config tab 复用 B4 数据，未达则占位/loading 降级，不阻塞合入；见 † 注） |
| **PR-19** | B6/US6 | Contracts + Coverage | Contracts(registry + envelope + gates CH-01..06)+ Coverage 矩阵 + 单测 | ~1800 | PR-06 |
| **PR-20** | B6/US6 | Deps + Groups | Deps explorer 4 视图(go mod graph)+ Groups preview | ~2000 | PR-06 |
| **PR-21** | B7/US7 | Landing | `/` health overview(健康卡 + 系统信息 + 部署 + KPI；BR-001/002)+ 单测 | ~1500 | PR-06 + BR-001/002 |
| **PR-22** | B7/US7 | Observability v1 | `/observe` 三 tab(BR-003 LGTM)+ Wave2 disabled + error boundary | ~1800 | PR-21 + BR-003 |
| **PR-23** | Polish | 收尾加固 | v-html 审计 + CSP + i18n 文案补全 + Lighthouse 调优 + 覆盖率补齐 | ~1000 | 各 batch |

**合计**：23 PR（含 2 个 ⚙️ 骨架/生成 PR）。手写业务变更总量 ~38k 行级，符合 PRD 设计稿移植估算。

## 并行与里程碑

```
PR-01 → PR-02 → PR-04 ┐
        PR-01 → PR-03 ┴→ PR-05 → PR-06 → ┬→ PR-07(认证) →┬→ PR-09→PR-10 (B2)
                                          │                ├→ PR-11→PR-12 (B3)
                                          │                ├→ PR-13 ∥ (PR-14→PR-15) (B4)
                                          ├→ PR-16→PR-17→PR-18 (B5) †
                                          ├→ PR-19 / PR-20 (B6，可并行)
                                          └→ PR-21→PR-22 (B7，待 BR)
PR-23 收尾（全 batch 后）
```

> **†** B5 链仅依赖 B0（故图中无 B4→B5 实线边，B5/B4 可并行启动）。PR-18 对 PR-13/14 为**软依赖**：仅其 Audit/Configuration tab 复用 B4 数据，B4 未就位时这两 tab 占位/loading 降级、显式标注（FR-080），不阻塞 PR-18 合入；正常里程碑序中 B4(P2) 先于 B5(P3) 完成，两 tab 自然接真实数据。
> **B4 内**：PR-13(`@gocell/audit`) 与 config 两页可并行；但 PR-14/PR-15 同属 `@gocell/config`、共享 `routes.ts` 与 `index.ts` 唯一出口，按宪法「同文件冲突归同一 worktree」串行（PR-14 → PR-15），不另开并行 worktree。

- **里程碑 1（可登录闭环）**：PR-01..08。
- **里程碑 2（Access 闭环）**：+ PR-09..12。
- **里程碑 3（运维闭环）**：+ PR-13..15。
- **里程碑 4（开发者平台）**：+ PR-16..20。
- **里程碑 5（完整 MVP）**：+ PR-21..23（待后端 BR）。

并行隔离：B2/B3/B4/B5/B6 分属不同 `@gocell/*` 包 → git worktree 并行无文件冲突（parallel-ai-cell-mapping.md）。
