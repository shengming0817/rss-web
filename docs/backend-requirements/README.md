# Backend Requirements (BR)

> 由 gocell-web 前端项目向后端 `ghbvf/gocell` 提出的需求清单。
> 每个 BR 是一份独立、可被后端工程师直接执行的 spec。

## 索引

| ID | 标题 | 状态 | 阻塞 |
|---|---|---|---|
| [BR-001](./BR-001-health-cells.md) | 聚合 cell 健康端点 | 待评审 | MVP Health overview |
| [BR-002](./BR-002-system-info.md) | 系统元信息端点 | 待评审 | MVP Health overview |
| [BR-003](./BR-003-observability-lgtm.md) | LGTM 可观测栈接入 | 待评审 | Observability v1 |
| [BR-004](./BR-004-access-pdp-evolution.md) | Access 子系统从 RBAC 演进到 ABAC | 待评审 | `/access/decide` 端点 MVP 阻塞；ABAC 演进 Wave 2+ |
| [BR-005](./BR-005-user-list.md) | 用户主体列表端点（`http.auth.user.list`） | 待评审 | `/access/identities` 列表（Batch 2 PR-09） |
| [BR-006](./BR-006-audit-hash-chain.md) | 审计行哈希链 + actor/result 元数据（`http.audit.list`） | 待评审 | 无（Batch 4 PR-13 已降级交付；解除后激活链校验） |
| [BR-007](./BR-007-flag-variant.md) | Feature Flag variant 定义与取值（`http.config.flags.*`） | 待评审 | 无（Batch 4 PR-14 bool flag 已交付；variant 占位） |
| [BR-008](./BR-008-config-version-history.md) | 配置项版本历史列表端点（`http.config.versions`） | 待评审 | 无（Batch 4 PR-14 rollback 手填版本已交付） |
| [BR-009](./BR-009-tenant-in-session.md) | 会话响应暴露 `tenantId`（`http.auth.login`/`refresh`） | 待评审 | `/access/policies` 角色 assign/revoke（#66 前端已优雅降级，待透出后接通） |

## 状态约定

- **待评审**：前端起草，等后端确认
- **已确认**：后端 owner 已接，进入实现队列
- **实现中**：后端在做，PR 链接已附
- **已交付**：后端已合并；前端联调中
- **已联调**：双方都过了

## 提交流程

1. 前端起草 BR，commit 到 `docs/backend-requirements/BR-XXX-*.md`
2. 在 `gocell` repo 开 issue，标题 `[BR-XXX] <title>`，body 链到这个文件
3. 后端 owner 评审，提 PR 改 status 到"已确认"
4. 实现完成后改 status 到"已交付"，前端开始联调
5. 联调通过改 "已联调"，BR 闭环

## 模板

新增 BR 时复制 `_TEMPLATE.md`（如果有）或参考 BR-001 的结构。每份 BR 必须包含：
- 背景与动机
- 接口规约（method/path/request/response/错误码）
- 验收标准
- 工作量估算
- 涉及代码区域（cell / slice / contract）
- 演进路径（如适用）
