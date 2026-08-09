# BR-006 · 审计行哈希链 + actor/result 元数据暴露（`http.audit.list.v1`）

| 字段 | 值 |
|---|---|
| 状态 | 待评审 |
| 优先级 | P1（审计页核心卖点「防篡改」无数据源；页面已降级上线） |
| 阻塞前端 | 无（Batch 4 PR-13 已以降级态交付）；解除后激活链校验 + 富 actor/result 展示 |
| 提出方 | gocell-web |
| 估算 | 1–2 人天（ledger 层已算 hash，主要是 HTTP 契约暴露 + handler 投影） |
| 涉及 | `auditcore/auditquery` slice；`contracts/http/audit/list/v1/response.schema.json` 增字段 |

---

## 1. 背景

设计稿 `docs/design/gocell/project/dev-audit.jsx` 的审计页是「防篡改合规轨迹」：每行带 `result`（ok/denied/failed）、`reason`、`hash`/`prev`（哈希链）、actor 的 `kind`/`ip`/`mfa`，页头有「chain integrity · OK · last verified」卡片。

但当前契约 `http.audit.list.v1.response.data[]` 仅有：
`id / eventId / eventType / actorId / subjectId? / correlationId? / occurredAt? / timestamp / payload?`

**缺 `hash`/`prevHash` → 哈希链校验无数据源；缺 `result`/`reason`/actor 元数据 → 详情面板与 result-based 快捷过滤无法实现。** 后端 ledger 层（`runtime/audit/ledger`，启动期 strict tail verify）已计算并持久化 hash 链，但未经 HTTP 暴露。

> 前端处理（PR-13 已交付）：
> - `lib/hashChain.ts` 实现 `verifyChain()`（ok/broken/unavailable 三态），算法完整且 spec 全覆盖，**当前对生产数据恒返回 `unavailable`**（无 hash 字段）。链卡显式渲染「此版本暂不支持哈希链校验」中性态，**绝不伪造 OK**。
> - actor 类型用 `classifyActor(actorId)` 前缀启发式（`@`→human、`sa:`/`svc`→service、`sb-`→sandbox、`*core`→cell），文本永远显示真实 `actorId`，kind 仅驱动装饰圆点。
> - 快捷过滤仅保留 actor-kind + eventType-namespace 维度（不做依赖 `result` 的过滤）。
> 后端按本 BR 交付字段后，前端 `pnpm codegen` 派生新字段，链卡 ok/broken 路径与富展示自动激活，**前端无需再改逻辑**（仅删 classifyActor 启发式，改用真实 `actorType`）。

## 2. 接口规约

### 2.1 `GET /api/v1/audit/` — response.data[] 增字段

在现有 `http.audit.list.v1.response.schema.json` 的 `data[].items.properties` 增补：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `entryHash` | string | ✅* | 本行内容的 SHA-256（ledger 已算）；hex，前端展示前 6 位 |
| `prevHash` | string | ✅* | 前一行的 `entryHash`；链首为 `"genesis"` 哨兵 |
| `result` | string | ✅* | 操作结果枚举：`ok` / `denied` / `failed` |
| `reason` | string | ❌ | 结果说明 / 拒绝原因（人类可读，非 i18n key） |
| `actorType` | string | ❌ | actor 类型枚举：`human` / `service` / `cell` / `sandbox`（替代前端前缀启发式） |
| `actorIp` | string | ❌ | 来源 IP（`internal` 表示集群内部） |
| `actorMfa` | string | ❌ | MFA 方式（如 `webauthn`），无则省略 |

> *标 ✅ 的字段建议必填，但需 backfill 策略：早于本字段引入的历史行，`entryHash`/`prevHash` 可为空串、`result` 缺省 `ok`——前端 `verifyChain` 已对「部分行缺 hash」返回 `unavailable`，不会误报 broken。

### 2.2（可选）`GET /api/v1/audit/verify` — 服务端链校验端点

若链长达百万级、不宜让前端逐行校验，可提供轻量校验端点：

```json
{ "data": { "status": "ok | broken", "headHash": "0x…", "lastVerifiedAt": "…", "entryCount": 0, "brokenAt": null } }
```

前端链卡优先消费此端点（与 `verifyChain()` 客户端算法二选一，按数据量决策）。

### 2.3（可选）audit list query 参数 schema

当前 `contracts/http/audit/list/v1/` 仅有 `response`，无 `request`。前端 quick filter 现为客户端过滤已加载页。后端如提供服务端过滤，建议加可选 query：`actorId` / `eventType`（前缀）/ `result` / `from` / `to` / `cursor` / `limit`，并补 `request.schema.json`。前端将 `ListAuditParams` 本地类型切换为 codegen 派生类型。

## 3. 验收标准

- [ ] `response.schema.json` 增字段并通过校验；前端 `pnpm codegen` 产出 `entryHash`/`prevHash`/`result` 等
- [ ] `prevHash` 链接关系成立：`data[i].prevHash === data[i+1].entryHash`（按 timestamp 倒序时）
- [ ] 篡改任一行 → 链断裂可被 `verifyChain()` / `/audit/verify` 检出（broken + brokenAt）
- [ ] `result` 枚举值与后端 ledger 实际写入一致
- [ ] 历史行 backfill 策略明确（空 hash 不致 broken 误报）

## 4. 演进路径

- **MVP（本 BR）**：暴露 hash + result + actor 元数据；前端激活链校验卡 + 富详情 + result 快捷过滤
- **Wave 2**：`/audit/verify` 服务端校验 + 协同签名（设计稿「co-signed by auditcore + observecore」）
- **Wave 3**：服务端 filter + range query（§2.3）

## 5. 涉及代码区域

- `contracts/http/audit/list/v1/response.schema.json`（增字段）+（可选）`verify/v1/`、`list/v1/request.schema.json`
- `cells/auditcore/slices/auditquery/handler.go`（投影 ledger hash + result 到 response DTO）
- `runtime/audit/ledger`（暴露 entryHash/prevHash 读路径；已有 strict tail verify 可复用为 /verify）

## 6. 前端联调

PR-13 已建到 ready 态。后端交付后：
1. `pnpm codegen` → `HttpAuditListV1Response.data[]` 新增字段
2. 删 `packages/audit/src/lib/auditClassify.ts` 的 `classifyActor` 启发式，改读 `actorType`
3. 链卡 `chainStatus` getter 自动返回 ok/broken（`verifyChain` 已就绪）
4. 恢复 result-based 快捷过滤（设计稿「sandbox denials」「failures only」）+ 详情面板 reason/ip/mfa 行
