# BR-003 · LGTM 可观测栈接入

| 字段 | 值 |
|---|---|
| 状态 | 待评审 |
| 优先级 | P1（Observability v1 阻塞） |
| 阻塞前端 | `/observe` 三 tab（Overview / Logs / Traces） |
| 提出方 | gocell-web |
| 估算 | 后端 3–5 人天（含 compose、wiring、CORS、文档） |
| 涉及 | docker-compose / corebundle / OTel SDK 配置 |

---

## 1. 背景

`gocell` 已用 `opentelemetry-go` SDK 产生 trace 和 metric 数据，但没有部署接收端。前端 `/observe` 页面设计了三个核心 tab：

- **Overview** — SLO budget burn rate（依赖 metric）
- **Logs** — 结构化日志搜索 + pivot 到 trace（依赖 log backend）
- **Traces** — trace explorer + BubbleUp 聚合 + trace diff（依赖 trace backend）

需要一套部署、配置都简单、HTTP API 可直接被前端调用的方案。

## 2. 方案：LGTM Stack

| 维度 | 选型 | 用途 |
|---|---|---|
| **L**ogs | [Loki](https://grafana.com/oss/loki/) | 结构化日志查询（LogQL） |
| **G**rafana | （不部署 Grafana UI） | 前端自己实现 UI，直接调 Loki/Tempo HTTP API |
| **T**races | [Tempo](https://grafana.com/oss/tempo/) | trace 存储 + TraceQL 查询 |
| **M**etrics | [Prometheus](https://prometheus.io/) | metric 存储 + PromQL |
| 采集层 | [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/) | OTLP 接收 → 分流到 Loki/Tempo/Prom |

**为什么不部署 Grafana UI**：前端 `/observe` 不是要"内嵌 Grafana"，而是按 gocell 自己的产品语言（cell × slice × contract）做差异化交互。直接调三个 backend 的 HTTP API 即可。

## 3. 工作内容

### 3.1 Docker Compose 扩展

在 `gocell/docker-compose.yml` 增加 4 个 service。**不修改现有的 pg/redis/rabbitmq/minio**。

```yaml
# gocell/docker-compose.yml（节选 — 新增部分）

services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.96.0
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes:
      - ./hack/observability/otelcol-config.yaml:/etc/otelcol/config.yaml:ro
    ports:
      - "4317:4317"   # OTLP/gRPC
      - "4318:4318"   # OTLP/HTTP
    depends_on:
      loki: { condition: service_started }
      tempo: { condition: service_started }
      prometheus: { condition: service_started }

  loki:
    image: grafana/loki:3.0.0
    command: ["-config.file=/etc/loki/config.yaml"]
    volumes:
      - ./hack/observability/loki-config.yaml:/etc/loki/config.yaml:ro
      - loki_data:/loki
    ports:
      - "3100:3100"

  tempo:
    image: grafana/tempo:2.4.1
    command: ["-config.file=/etc/tempo/config.yaml"]
    volumes:
      - ./hack/observability/tempo-config.yaml:/etc/tempo/config.yaml:ro
      - tempo_data:/var/tempo
    ports:
      - "3200:3200"   # Tempo HTTP API
      - "9095:9095"   # tempo gRPC (otelcol → tempo)

  prometheus:
    image: prom/prometheus:v2.50.0
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.path=/prometheus
      - --web.enable-remote-write-receiver
    volumes:
      - ./hack/observability/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prom_data:/prometheus
    ports:
      - "9091:9090"   # 避开 corebundle 的 9090

volumes:
  loki_data:
  tempo_data:
  prom_data:
```

四份 config 文件放在 `gocell/hack/observability/`：
- `otelcol-config.yaml` — OTLP 接收 + Loki/Tempo/Prom exporter wiring
- `loki-config.yaml` — 单租户 filesystem 模式
- `tempo-config.yaml` — local block storage
- `prometheus.yml` — scrape config + remote write enabled

### 3.2 OTel Collector 配置示例

```yaml
# gocell/hack/observability/otelcol-config.yaml

receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

processors:
  batch:
    timeout: 5s
  attributes:
    actions:
      - key: cell
        action: insert
        from_attribute: cell.name
      - key: slice
        action: insert
        from_attribute: slice.name

exporters:
  otlp/tempo:
    endpoint: tempo:9095
    tls: { insecure: true }
  loki:
    endpoint: http://loki:3100/loki/api/v1/push
  prometheusremotewrite:
    endpoint: http://prometheus:9090/api/v1/write

service:
  pipelines:
    traces:
      receivers:  [otlp]
      processors: [attributes, batch]
      exporters:  [otlp/tempo]
    logs:
      receivers:  [otlp]
      processors: [attributes, batch]
      exporters:  [loki]
    metrics:
      receivers:  [otlp]
      processors: [batch]
      exporters:  [prometheusremotewrite]
```

### 3.3 corebundle 配置

新增 env 变量（默认值即可在 dev 环境跑起来）：

```bash
GOCELL_OTLP_ENDPOINT=otel-collector:4317   # gRPC 默认
GOCELL_OTLP_PROTOCOL=grpc                  # 或 http
GOCELL_OTEL_LOG_EXPORTER=otlp              # 替代 stdout（dev 仍可保持 stdout）
GOCELL_OTEL_RESOURCE_ATTRS="service.name=corebundle,deployment.environment=dev"
```

corebundle 启动时已经初始化 OTel TracerProvider，只需把 exporter 从默认（stdout/none）切到 OTLP。代码改动量极小。

### 3.4 CORS 与代理（关键决策）

**方案 A · 前端直连 Loki/Tempo/Prom HTTP API**（推荐）
- 三个组件都支持 CORS，开 `Access-Control-Allow-Origin: *` 即可（dev 环境）
- 生产环境通过 nginx/ingress 加权限校验后再转发
- 前端 axios baseURL 配三个不同值

**方案 B · 通过 gocell BFF 代理**
- corebundle 加 `/api/v1/observability/{loki,tempo,prometheus}/*` 路由，反向代理到对应 backend
- 优点：统一鉴权（用 gocell 已有 JWT 中间件）
- 缺点：多一跳；需要后端写代理代码

**推荐**：dev 用 A，生产换 B。BR-003 一期只要求 dev 跑通（方案 A）。

### 3.5 文档更新

- `gocell/docs/observability/` 下新增 `lgtm-stack.md`，说明 compose 命令、各端口、查询示例
- `gocell/.env.example` 增加 4 个 OTLP env 变量

## 4. 前端如何使用

```typescript
// src/api/observability.ts

const LOKI = import.meta.env.VITE_LOKI_URL || 'http://localhost:3100';
const TEMPO = import.meta.env.VITE_TEMPO_URL || 'http://localhost:3200';
const PROM = import.meta.env.VITE_PROMETHEUS_URL || 'http://localhost:9091';

export async function queryLogs(logql: string, range: TimeRange) {
  const url = `${LOKI}/loki/api/v1/query_range?query=${encodeURIComponent(logql)}` +
              `&start=${range.start}&end=${range.end}&limit=200`;
  return fetch(url, { headers: authHeaders() }).then(r => r.json());
}

export async function queryTracesByService(service: string, limit = 20) {
  const url = `${TEMPO}/api/search?tags=${encodeURIComponent(`service.name=${service}`)}&limit=${limit}`;
  return fetch(url).then(r => r.json());
}

export async function queryMetric(promql: string, range: TimeRange) {
  const url = `${PROM}/api/v1/query_range?query=${encodeURIComponent(promql)}` +
              `&start=${range.start}&end=${range.end}&step=15s`;
  return fetch(url).then(r => r.json());
}
```

## 5. 验收标准

- [ ] `docker compose up -d` 起 4 个新 service，全部 healthy
- [ ] corebundle 启动后能看到 OTLP 数据流入 Loki / Tempo / Prometheus
- [ ] 直接 curl `http://localhost:3100/loki/api/v1/query?query={service="corebundle"}` 能拿到日志
- [ ] 直接 curl `http://localhost:3200/api/search?limit=1` 能拿到 trace
- [ ] 直接 curl `http://localhost:9091/api/v1/query?query=up` 能拿到 metric
- [ ] CORS header 配置正确（前端 dev 直连不报跨域）
- [ ] `gocell/docs/observability/lgtm-stack.md` 完成

## 6. 演进路径

- **v1（MVP）**：本 BR 范围 — 三个 backend 起来，前端直连，dev 用
- **v2**：BFF 代理 + RBAC（生产用）
- **v3**：Anomaly inbox 后端 — gocell 主动 publish 异常事件到 `event.anomaly.*` topic（参考设计稿 chat6 v2 Observability）

## 7. 风险与备选

- **存储成本**：Loki/Tempo/Prom 都用 local filesystem，单机够用；规模上来后需要切到 S3/MinIO（MinIO 已经在 compose 里，复用即可）
- **资源消耗**：4 个 service 大约吃 1GB 内存，本地 dev 可接受
- **备选**：如果不想引入 4 个组件，可以**只装 Tempo + 让 gocell 用 zap/slog 写文件 + 文件 tail 给前端**。但这丢掉了 LogQL 查询能力，不推荐。
