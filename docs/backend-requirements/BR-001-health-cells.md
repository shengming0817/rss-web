# BR-001 · 聚合 cell 健康端点

| 字段 | 值 |
|---|---|
| 状态 | 待评审 |
| 优先级 | P0（MVP 阻塞） |
| 阻塞前端 | Health overview 页面（`/` landing） |
| 提出方 | gocell-web |
| 估算 | 1–2 人天 |
| 涉及 | corebundle / 各 cell 的 `Health()` 实现 |

---

## 1. 背景

`gocell.Cell` 接口已定义 `Health() error`，但目前只通过 `/readyz` 暴露**二值聚合**（200 / 503），无法支撑前端 Health overview 页所需的：

- 单 cell 维度的健康判断（哪个 cell 红了）
- slice 维度的健康判断（哪个 slice 红了）
- cell 元信息（版本、commit、uptime、durability mode）

`gocell-web` 的 Health overview 是 MVP 唯一的 landing page，目前阻塞。

## 2. 接口规约

### 2.1 `GET /api/v1/admin/health/cells`

**Auth**：JWT Bearer，role=admin
**Cell 归属**：建议放在 `auditcore`（已是 control-plane 角色），或新建 `adminbff` cell
**Success status**：200

#### Response Schema

```json
{
  "summary": {
    "totalCells": 3,
    "healthy": 3,
    "degraded": 0,
    "down": 0,
    "lastCheckAt": "2026-05-23T10:30:00Z"
  },
  "cells": [
    {
      "name": "accesscore",
      "type": "core",
      "status": "healthy",
      "durability": "Durable",
      "version": "v0.3.1",
      "commit": "8c3a4b9",
      "startedAt": "2026-05-23T01:00:00Z",
      "uptimeSeconds": 34200,
      "lastHealthCheckAt": "2026-05-23T10:30:00Z",
      "lastHealthCheckDurationMs": 12,
      "sliceCount": 10,
      "slices": [
        {
          "name": "sessionlogin",
          "status": "healthy",
          "lastErrorAt": null,
          "lastErrorMessage": null
        },
        {
          "name": "sessionrefresh",
          "status": "degraded",
          "lastErrorAt": "2026-05-23T10:25:11Z",
          "lastErrorMessage": "redis pool exhausted (1/5 connections recovered)"
        }
      ]
    }
  ]
}
```

#### 字段约束

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `cells[].name` | string | ✅ | 与 cell.yaml 中 metadata.name 一致 |
| `cells[].type` | enum: `core` / `edge` / `support` | ✅ | 与 cell.yaml metadata.type 一致 |
| `cells[].status` | enum: `healthy` / `degraded` / `down` / `starting` / `stopping` | ✅ | 由 `Health()` 错误聚合 |
| `cells[].durability` | enum: `Durable` / `Demo` | ✅ | develop 分支强制声明 |
| `cells[].slices[].status` | 同 cells[].status | ✅ | 每个 slice 独立健康检查（如果未实现单 slice 级，全部置 healthy） |

#### 错误码（统一 envelope `shared/errors/error-response-v1.schema.json`）

| Status | code | 说明 |
|---|---|---|
| 401 | ERR_AUTH_REQUIRED | 未携带 token 或 token 无效 |
| 403 | ERR_AUTH_FORBIDDEN | token 有效但角色非 admin |
| 500 | ERR_INTERNAL | 健康检查执行异常 |

### 2.2 健康聚合规则

- 任一 slice `down` → cell `degraded`
- 任一 slice 抛 panic / 检查超时（>200ms）→ cell `down`
- `/readyz` 行为不变（保持二值），但**改为基于本端点的 summary 派生**：`summary.down == 0 ? 200 : 503`

### 2.3 实现建议

```go
// cells/<adminbff or auditcore>/slices/healthaggregate/handler.go

type HealthAggregator struct {
    cells map[string]gocell.Cell
    clock clock.Clock
}

func (h *HealthAggregator) Handle(ctx context.Context) (*HealthResponse, error) {
    resp := &HealthResponse{ Summary: Summary{...}, Cells: []CellHealth{} }
    for name, cell := range h.cells {
        ch := CellHealth{ Name: name, /*...*/ }
        ctx2, cancel := context.WithTimeout(ctx, 200*time.Millisecond)
        defer cancel()
        if err := cell.Health(ctx2); err != nil {
            ch.Status = "degraded"
            // 收集 slice 级错误（若 Cell 接口支持暴露）
        } else {
            ch.Status = "healthy"
        }
        resp.Cells = append(resp.Cells, ch)
    }
    return resp, nil
}
```

健康检查 fan-out 必须有 timeout（建议 200ms 上限 / 总耗时 ≤ 1s）。

### 2.4 Cell 接口的扩展建议（可选，工作量更大）

当前 `Cell.Health() error` 返单一 error。为了更细的诊断信息，建议扩展为：

```go
type CellWithDiagnostics interface {
    Cell
    Diagnose(ctx context.Context) (*Diagnosis, error)
}

type Diagnosis struct {
    SliceStatuses map[string]SliceStatus
    LastErrors    []ErrorSample
}
```

未实现 `CellWithDiagnostics` 的 cell 走旧路径（仅返回 cell 级 health，slice 详情为空数组）。

## 3. 验收标准

- [ ] 端点返回的 JSON 通过新增的 `health-cells-response-v1.schema.json` 校验
- [ ] 各 cell 至少有 1 个 slice 在 mocked-error 场景下被正确报为 degraded
- [ ] 端点 p95 ≤ 50ms（3 cell × 10 slice 规模下）
- [ ] 401/403/500 三种错误路径有单测
- [ ] OpenAPI 文档（如有）已同步
- [ ] `/readyz` 行为通过现有 integration test

## 4. 演进路径

- **MVP**：实现 2.1 + 2.2，slice 级用 cell.Health() 简单复制
- **Wave 2**：扩展 `CellWithDiagnostics`，slice 级独立健康检查 + 错误样本
- **Wave 3**：暴露 streaming（SSE / WebSocket），前端实时更新状态

## 5. 涉及代码区域

- `kernel/cell.go`（Cell 接口可能需要扩展）
- `cmd/corebundle/cell_module.go`（aggregator wiring）
- 新增 `cells/<adminbff or auditcore>/slices/healthaggregate/`
- 新增 `contracts/http/admin/health/cells/v1/contract.yaml` + schema

## 6. 前端联调

前端调用代码草案：

```typescript
// src/api/admin.ts
export interface CellHealth { /* 与 BR-001 §2.1 同 */ }
export interface HealthResponse { summary: Summary; cells: CellHealth[]; }

export async function fetchCellHealth(): Promise<HealthResponse> {
  return http.get('/api/v1/admin/health/cells').then(r => r.data);
}
```

前端轮询频率：30s 一次（页面停留时）；可被 30s 内的手动刷新覆盖。
