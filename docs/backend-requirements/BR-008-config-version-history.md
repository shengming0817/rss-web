# BR-008 · 配置项版本历史列表端点（`http.config.versions.v1`）

| 字段 | 值 |
|---|---|
| 状态 | 待评审 |
| 优先级 | P2（rollback 已可用，但目标版本需手填；历史列表为体验增强） |
| 阻塞前端 | 无（Batch 4 PR-14 rollback 以 number input 手填版本交付） |
| 提出方 | gocell-web |
| 估算 | 0.5–1 人天（versions 已持久化，主要是 list 端点 + 契约） |
| 涉及 | `configcore/configread`；新增 `contracts/http/config/versions/v1/` |

---

## 1. 背景

配置页（T403）支持 rollback：`http.config.rollback.v1.request = { version, expectedVersion }`，即回滚到**指定 version**。但当前**无端点可枚举某 key 的历史版本** —— `config.list` 只返回每个 entry 的**当前** version，拿不到可选的历史版本号。

> 前端处理（PR-14 已交付）：rollback 确认对话框用 `<input type="number">`（min=1，max=当前version-1）让用户**手填**目标版本号。可用但不友好（用户需自行知道要回滚到哪一版）。代码注释标 `BR-008 pending`。

## 2. 接口规约

### 2.1 `GET /api/v1/config/{key}/versions`

**Auth**：JWT Bearer，role=admin（与 config 写操作一致）
**分页**：cursor-based，与 audit/role/user list 一致（`nextCursor` + `hasMore`）

#### Response Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "http.config.versions.v1.response",
  "type": "object",
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "version": { "type": "integer" },
          "value": { "type": "string" },
          "sensitive": { "type": "boolean" },
          "publishedAt": { "type": "string", "format": "date-time" },
          "publishedBy": { "type": "string" },
          "isCurrent": { "type": "boolean" }
        },
        "required": ["version", "sensitive", "publishedAt", "isCurrent"]
      }
    },
    "nextCursor": { "type": "string" },
    "hasMore": { "type": "boolean" }
  },
  "required": ["data", "nextCursor", "hasMore"]
}
```

> 与 `config.publish` 一致的脱敏约定：`sensitive=true` 时 `value` 为 `"******"` 占位（不可回写），且历史值同样脱敏。

## 3. 验收标准

- [ ] 端点返回某 key 的全部历史版本（倒序），含 `isCurrent` 标记当前版
- [ ] 分页约定与 audit/role list 一致（`nextCursor` 空串 + `hasMore`）
- [ ] sensitive 历史值脱敏为 `"******"`
- [ ] key 不存在 → 404 ERR_NOT_FOUND
- [ ] 前端 `pnpm codegen` 产出 `HttpConfigVersionsV1Response`

## 4. 演进路径

- **本 BR**：版本历史列表；前端 rollback 对话框由「手填 number」升级为「历史版本选择器 + diff 预览」
- **Wave 2**：staged-vs-active diff 视图（设计稿 `dev-cell2.jsx` Diff 按钮）；版本时间线（复用审计页链时间轴语言）

## 5. 涉及代码区域

- 新增 `contracts/http/config/versions/v1/contract.yaml` + `response.schema.json`
- `cells/configcore/slices/configread`（新增 ListVersions handler + service；versions 已持久化于 publish 快照表）

## 6. 前端联调

PR-14 已建到 ready 态（手填 version）。后端交付后：
1. `pnpm codegen` → `HttpConfigVersionsV1Response`
2. `useConfigStore` 增 `fetchVersions(key)` action + state
3. rollback `ConfirmDialog` 的 number input 替换为历史版本下拉（含 publishedAt/publishedBy/isCurrent），去掉手填
