# BR-002 · 系统元信息端点

| 字段 | 值 |
|---|---|
| 状态 | 待评审 |
| 优先级 | P0（MVP 阻塞） |
| 阻塞前端 | Health overview · 系统信息卡片 |
| 提出方 | gocell-web |
| 估算 | 0.5 人天 |
| 涉及 | corebundle |

---

## 1. 背景

Health overview 页除了 per-cell 健康（见 [BR-001](./BR-001-health-cells.md)），还需要展示**整体进程**的元信息：构建版本、commit、运行时数据、监听地址。这些信息现在没有任何 API 暴露——`/readyz` 只有 200/503。

后端工程师调试时也常需要这种信息（比如确认部署的是哪个 commit），所以这个端点不仅服务前端，也是 ops 工具。

## 2. 接口规约

### 2.1 `GET /api/v1/admin/system`

**Auth**：JWT Bearer，role=admin
**Cell 归属**：`auditcore`（control-plane）或新建 `adminbff` cell
**Success status**：200

#### Response Schema

```json
{
  "build": {
    "version": "v0.3.1",
    "commit": "8c3a4b9",
    "commitDate": "2026-05-22T15:00:00Z",
    "buildDate": "2026-05-23T00:00:00Z",
    "goVersion": "go1.22.0",
    "tags": ["catalog_gen"],
    "dirty": false
  },
  "runtime": {
    "uptimeSeconds": 34200,
    "goroutines": 142,
    "memoryMB": 87.4,
    "memoryAllocBytes": 91750400,
    "gcPauseTotalNs": 12450000,
    "cpuPercent": 1.2,
    "pid": 12345
  },
  "assembly": {
    "name": "corebundle",
    "cells": ["accesscore", "auditcore", "configcore"],
    "primaryAddr": ":8080",
    "internalAddr": "127.0.0.1:9090"
  },
  "environment": {
    "env": "dev",
    "hostname": "gocell-1",
    "containerized": true
  }
}
```

#### 字段约束

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `build.version` | string | ✅ | `v` 前缀 semver；未发布版用 git describe |
| `build.commit` | string | ✅ | 短 hash（7 位）或全长 |
| `build.dirty` | bool | ✅ | 构建时是否有未提交改动 |
| `runtime.memoryMB` | number | ✅ | `runtime.MemStats.Alloc / 1024 / 1024`，保留 1 位小数 |
| `runtime.cpuPercent` | number | ⚠️ | 进程级 CPU 占用，1 秒采样窗口；若实现复杂可置 -1 |
| `assembly.cells` | string[] | ✅ | 按启动顺序 |
| `environment.env` | enum: `dev` / `staging` / `prod` | ⚠️ | 从 `GOCELL_ENV` 读 |

#### 错误码

同 [BR-001 §2.1 错误码表](./BR-001-health-cells.md#错误码)。

### 2.2 实现建议

```go
// cells/<adminbff or auditcore>/slices/systeminfo/handler.go

import "runtime"

func (h *SystemInfo) Handle(ctx context.Context) (*SystemResponse, error) {
    var ms runtime.MemStats
    runtime.ReadMemStats(&ms)
    return &SystemResponse{
        Build: h.buildInfo,            // 启动时通过 -ldflags 注入
        Runtime: RuntimeInfo{
            UptimeSeconds: time.Since(h.startedAt).Seconds(),
            Goroutines:    runtime.NumGoroutine(),
            MemoryMB:      float64(ms.Alloc) / 1024 / 1024,
            // cpuPercent 可用 gopsutil 或置 -1
        },
        Assembly: h.assemblyInfo,      // 启动时注入
        Environment: EnvironmentInfo{
            Env: os.Getenv("GOCELL_ENV"),
            Hostname: hostname,
        },
    }, nil
}
```

构建信息通过 ldflags 注入（推荐放进 Makefile）：

```makefile
LDFLAGS := \
  -X main.version=$(shell git describe --tags --always) \
  -X main.commit=$(shell git rev-parse --short HEAD) \
  -X main.commitDate=$(shell git log -1 --format=%cI) \
  -X main.buildDate=$(shell date -u +%Y-%m-%dT%H:%M:%SZ)
```

## 3. 验收标准

- [ ] `/api/v1/admin/system` 返回的 JSON 通过新增的 `system-info-response-v1.schema.json` 校验
- [ ] `build.commit` 在 release binary 中与 git HEAD 一致
- [ ] `runtime.uptimeSeconds` 与进程启动时间相符（误差 < 1s）
- [ ] 401/403 错误路径有单测
- [ ] CI build 注入 ldflags 验证通过

## 4. 涉及代码区域

- `cmd/corebundle/main.go`（在 `main()` 中接收 ldflags 注入的 build 信息）
- 新增 `cells/<adminbff or auditcore>/slices/systeminfo/`
- 新增 `contracts/http/admin/system/v1/contract.yaml` + schema
- `Makefile`（ldflags 注入）

## 5. 前端联调

前端调用频率：进入 Health overview 时拉一次，无需轮询（system 信息变化频率低）；用户点"刷新"按钮可手动刷新。
