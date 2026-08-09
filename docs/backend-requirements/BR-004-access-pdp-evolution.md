# BR-004 · Access 子系统从 RBAC 演进到 ABAC

| 字段 | 值 |
|---|---|
| 状态 | 待评审 |
| 优先级 | P1（MVP 阻塞 Access UI；P0 项是 §4.1 的 HTTP PDP 端点） |
| 阻塞前端 | `/access/identities`、`/access/policies`、`/access/decisions`（Wave 2） |
| 提出方 | gocell-web |
| 估算 | MVP 段 1.5 人天；ABAC 演进段 5–8 人天（分阶段） |
| 涉及 | `accesscore/authorizationdecide`、`rbacassign`、`rbaccheck` 三 slice；新增 contract |

---

## 1. 背景

前端 `/access` 域设计原则：**identity（谁）/ policy（规则）/ decision（结果）三件事在 UI 上必须分离**。原因：
- 现在是 RBAC（subject + 1 个属性 "role"），未来必然要 ABAC（subject + N 属性 × action × resource + N 属性 × env）
- 把 "Roles" 折叠到 "Users 页签" 会让 ABAC 升级时整个 UI 重做
- 后端 `authorizationdecide` slice 命名已经预留 PDP（Policy Decision Point）抽象 — 前端架构应该跟上

### 1.1 后端现状（来自代码）

```go
// cells/accesscore/slices/authorizationdecide/service.go
type Service struct {
  roleRepo ports.RoleRepository
}

// Authorize：sync 调用，返回 bool；没有结构化决策结果
func (s *Service) Authorize(ctx, subject, resource, action string) (bool, error)
```

| 现状 | 局限 |
|---|---|
| `authorizationdecide` 只暴露 Go 接口（`runtime/auth.Authorizer`） | **前端无法调用 PDP**，只能间接调依赖 PDP 的具体 endpoint |
| 决策结果只有 `bool` | 无法回答"为什么允许 / 命中哪条策略 / 拒绝原因" |
| 单条查询，无批量 | UI 一次查 50 个权限要发 50 个请求 |
| 决策不落盘 | 无法做"为什么这个用户拿不到这个资源"的回溯 |
| 模型硬绑 `(subject, resource, action)` 三元组 | ABAC 需要 `(subject_attrs, action, resource_attrs, env_attrs)` 多属性 |

### 1.2 目标

- **MVP（本 BR §4.1 + §4.2）**：让前端能调 PDP；让前端能列举 roles + permissions（已有 `http.auth.role.*` 契约够用）
- **Wave 2（本 BR §4.3 + §4.4）**：决策日志 + 批量决策
- **Wave 3+（本 BR §4.5）**：ABAC 演进 — 扩展 Subject/Resource 为属性集合，PDP 接口保持稳定

---

## 2. 演进路径概览

| 阶段 | UI 表现 | PDP 接口形态 | 数据模型 |
|---|---|---|---|
| **现状** | 无 | Go 函数 `Authorize(sub, res, act) bool` | RoleRepository（role + permissions[]）|
| **MVP** | `/access/identities` + `/access/policies?tab=roles` | + HTTP 包装 `POST /api/v1/access/decide`，返 structured `Decision` | 不变 |
| **Wave 2** | + `/access/decisions` 决策日志 | + 批量 `POST /api/v1/access/decide/batch`<br>+ 决策落 outbox `event.access.decided.v1` | 决策事件存 audit 链 |
| **Wave 3** | + `/access/policies?tab=rules`（条件编辑器） | Subject/Resource/Action 改为 attribute map | 增加 PolicyRule 表（独立于 RoleRepository） |
| **Wave 4** | + `/access/policies?tab=templates`<br>+ `/access/reviews` | 不变（PDP 已稳定） | 增加 PolicyTemplate、ReviewCampaign 表 |

**关键原则**：PDP 接口在 Wave 2 之后**不再 breaking change**。后续是 attribute 扩展、policy rule 表演进，UI 侧透明。

---

## 3. 设计：Decision 接口

新增统一的 PDP HTTP 边界。请求 / 响应**预留 ABAC 字段**，但 MVP 段只填 RBAC 子集。

### 3.1 Request

```jsonc
{
  // 主体：MVP 阶段只用 id；Wave 3 起 attributes 生效
  "subject": {
    "id": "usr-12345",
    "type": "user",                          // user / service-account / cell / external
    "attributes": {                          // Wave 3 起前端可传更多属性供 PDP 取用
      // "dept": "platform", "level": "L5", "mfaVerified": true
    }
  },
  // 动作：与契约 verb 一致；MVP 形如 "read"/"write"/"delete"
  "action": "write",
  // 资源：MVP 用 id（URL path 或资源 URN）；Wave 3 起 attributes 生效
  "resource": {
    "id": "/api/v1/config/entries/foo",
    "type": "config-entry",
    "attributes": {
      // "owner": "team-platform", "sensitivity": "high"
    }
  },
  // 环境：MVP 可不传；Wave 3 起前端可注入 client IP、时间窗、MFA 状态等
  "environment": {
    // "ip": "...", "time": "...", "deviceTrust": "managed"
  }
}
```

### 3.2 Response

```jsonc
{
  "decision": "allow",                       // allow / deny / not-applicable
  "reason": "subject has role 'admin' which grants action 'write' on resource '/api/v1/config/*'",
  "matchedPolicies": [                       // MVP 至少返回 [{type:"role", id:"admin"}]
    { "type": "role", "id": "admin", "version": "v1" }
  ],
  "obligations": [],                         // Wave 3+：附加要求，如 "需要二次 MFA"
  "advice": [],                              // Wave 3+：建议（非强制）
  "evaluatedAtMs": 12,                       // PDP 评估耗时
  "decisionId": "dec_01HW...."               // 唯一 ID，供 §4.3 决策日志关联
}
```

**`decision` 三态语义**：
- `allow`：明确允许
- `deny`：明确拒绝（命中拒绝策略 / 无任何匹配策略）
- `not-applicable`：策略集合中**没有任何规则**适用于此 (subject, action, resource) — 用于让调用方区分"被拒"和"问错了"。MVP 阶段 PDP 可统一返 `deny`，但接口字段保留。

---

## 4. 具体后端需求清单

### 4.1 `POST /api/v1/access/decide`（MVP 必做）

**Auth**：JWT Bearer
**Cell**：`accesscore`
**Slice**：扩展 `authorizationdecide`
**Success status**：200

实现：包装现有 `Service.Authorize()`，在 Go 层加 HTTP handler + 接口转换。

**估算**：0.5 人天。

### 4.2 PDP 内部接口稳定化（MVP 必做）

把当前的 `Authorize(ctx, subject, resource, action string) (bool, error)` 重构为：

```go
// runtime/auth/authorizer.go
type DecisionRequest struct {
    Subject     Subject
    Action      string
    Resource    Resource
    Environment Environment
}

type Subject struct {
    ID         string
    Type       string             // "user" / "service-account" / "cell" / "external"
    Attributes map[string]any     // ABAC 预留；RBAC 段空 map
}

type Resource struct {
    ID         string
    Type       string
    Attributes map[string]any
}

type Environment struct {
    Attributes map[string]any
}

type Decision struct {
    Effect          DecisionEffect  // "allow" / "deny" / "not-applicable"
    Reason          string
    MatchedPolicies []PolicyRef
    Obligations     []Obligation
    Advice          []Advice
    EvaluatedAtMs   int
    DecisionID      string
}

type Authorizer interface {
    Decide(ctx context.Context, req DecisionRequest) (*Decision, error)
}
```

**MVP 段**：`Decide()` 内部仍只看 `Subject.ID + Action + Resource.ID`，忽略 attributes。但**接口形态固化** — Wave 3 增加 attribute 评估时不破坏 caller。

**估算**：0.5 人天（含单测迁移）。

### 4.3 决策日志：`event.access.decided.v1` + 查询端点（Wave 2）

#### 4.3.1 落 outbox（auditcore 消费）

每次 `Decide()` 调用后，PDP 通过 outbox publish：

```jsonc
// event.access.decided.v1
{
  "decisionId": "dec_01HW...",
  "subject": {...},
  "action": "...",
  "resource": {...},
  "decision": "allow",
  "matchedPolicies": [...],
  "decidedAt": "2026-05-23T10:30:00Z",
  "decidedBy": "authorizationdecide@accesscore"
}
```

`auditcore` 已有 outbox 消费机制，加一个 `auditappenddecision` slice 把此 event 写入审计链。

#### 4.3.2 查询端点：`GET /api/v1/access/decisions`

```jsonc
// query: ?subjectId=usr-12345&decision=deny&from=...&to=...&limit=50
{
  "items": [
    {
      "decisionId": "dec_01HW...",
      "decidedAt": "2026-05-23T10:30:00Z",
      "subject": {...},
      "action": "...",
      "resource": {...},
      "decision": "deny",
      "reason": "no matching policy",
      "matchedPolicies": []
    }
  ],
  "nextCursor": "..."
}
```

**采样策略**（避免决策风暴写爆 audit 链）：
- 默认只记 `decision != allow` 的决策（拒绝 + not-applicable）
- 配置项 `GOCELL_PDP_LOG_ALL=true` 时全量记录
- 高频路径（如每请求一次的 endpoint 鉴权）建议批采样

**估算**：3 人天。

### 4.4 批量决策：`POST /api/v1/access/decide/batch`（Wave 2）

UI 场景：登录后一次查"这个用户能看到哪些菜单项"。

```jsonc
// Request
{
  "decisions": [
    { "subject": {...}, "action": "read", "resource": {"id":"users"} },
    { "subject": {...}, "action": "write", "resource": {"id":"config"} },
    // ... up to 100 per request
  ]
}

// Response
{
  "decisions": [
    { "decision": "allow", "matchedPolicies": [...] },
    { "decision": "deny",  "reason": "..." },
  ]
}
```

**约束**：单请求最多 100 条；超出 413。

**估算**：1 人天。

### 4.5 ABAC 演进段（Wave 3+，不阻塞 MVP）

#### 4.5.1 Subject attribute provider

PDP 评估时按需拉取 attribute：

```go
type SubjectAttributeProvider interface {
    Resolve(ctx context.Context, subjectID string) (map[string]any, error)
}
```

实现示例：
- `IdentityAttributeProvider`：从 `identitymanage` 拉用户基础属性（dept、level）
- `RoleAttributeProvider`：把 roles[] 也作为一个属性 `subject.roles = ["admin", "billing-viewer"]` 暴露 — **这是 RBAC 退化为 ABAC 的关键**
- `MfaAttributeProvider`：从 session 拉 `mfaVerified`

PDP 在评估前 fan-out 调 provider，组合成完整 Subject.Attributes。

#### 4.5.2 PolicyRule 表

新增独立于 RoleRepository 的策略表：

```go
type PolicyRule struct {
    ID          string
    Description string
    Effect      DecisionEffect    // allow / deny
    Condition   string            // CEL / Cedar / Rego 表达式
    Priority    int
    Tags        []string          // 例如 "rbac-equivalent" 标记从 role 派生的 rule
    CreatedAt   time.Time
    UpdatedAt   time.Time
}
```

**条件表达式语言选型**（待评审）：

| 候选 | 优点 | 缺点 |
|---|---|---|
| **Cedar** (AWS) | 设计专为 ABAC；类型安全；有 formal verifier | Go 实现不成熟；学习曲线 |
| **CEL** (Google) | gRPC 生态成熟；Go SDK 好 | 非 PDP 专用；安全语义弱 |
| **Rego/OPA** | 业界标准；功能强 | 嵌入 Go 进程的复杂度高；性能不如 CEL |

**推荐**：CEL（务实选择）。

#### 4.5.3 Role 兼容层

老的 Role + Permission 表保留，启动时**自动派生**为 PolicyRule：

```
Role "admin" with perms [{resource: "/api/v1/config", action: "write"}]
  ↓ derive
PolicyRule {
  id: "rbac:admin:0",
  effect: allow,
  condition: 'subject.roles.contains("admin") && resource.id.matches("^/api/v1/config(/.*)?$") && action == "write"',
  tags: ["rbac-equivalent", "role:admin"]
}
```

→ 老数据零迁移，旧 UI（Roles tab）继续工作；新 UI（Rules tab）能编辑/查看 native PolicyRule。

**估算（4.5 整段）**：5–8 人天，分多个 PR。

---

## 5. 前端调用示例

```typescript
// src/lib/perms.ts
import { decide, decideBatch } from '@/api/access';

export async function can(action: string, resourceId: string): Promise<boolean> {
  const user = useAuthStore().currentUser!;
  const d = await decide({
    subject: { id: user.id, type: 'user', attributes: {} },
    action,
    resource: { id: resourceId, type: 'generic', attributes: {} },
  });
  return d.decision === 'allow';
}

// 组件用法
<Can action="write" resource="/api/v1/config">
  <a-button>Edit config</a-button>
</Can>
```

---

## 6. 验收标准（按段）

### 6.1 MVP 段（§4.1 + §4.2）

- [ ] `POST /api/v1/access/decide` 端点返回的 JSON 通过新增 schema 校验
- [ ] `runtime/auth.Authorizer` 接口迁移完，所有 caller 重编无 break
- [ ] 单测覆盖：allow / deny / 错请求（无 subject 等）
- [ ] OpenAPI / contract registry 同步
- [ ] 前端能用 `can()` 拿到结果，UI 守卫生效

### 6.2 Wave 2 段（§4.3 + §4.4）

- [ ] 决策事件出现在 audit 链中，hash chain 验证通过
- [ ] `GET /api/v1/access/decisions` 能按 filter 查询
- [ ] 决策日志采样配置项工作
- [ ] 批量决策端点 100 条 p95 ≤ 30ms

### 6.3 ABAC 演进段（§4.5）

按子 PR 分别验收（attribute provider / PolicyRule 表 / 条件引擎 / Role 兼容层），略。

---

## 7. 涉及代码区域

### MVP 段
- `cells/accesscore/slices/authorizationdecide/`（扩展 handler + 接口重构）
- `runtime/auth/authorizer.go`（接口扩容）
- 新增 `contracts/http/access/decide/v1/contract.yaml` + schema
- 所有现有 `Authorizer` 接口的 caller 站点

### Wave 2 段
- 新增 `cells/auditcore/slices/auditappenddecision/`
- 新增 `contracts/event/access/decided/v1/contract.yaml`
- 新增 `contracts/http/access/decisions/list/v1/contract.yaml`
- 新增 `contracts/http/access/decide/batch/v1/contract.yaml`

### Wave 3+ 段
- 新增 `cells/accesscore/internal/policy/`（PolicyRule 表 + 条件引擎）
- 新增 `runtime/auth/attribute_provider.go`
- migration：Role → PolicyRule 自动派生

---

## 8. 风险与备选

| 风险 | 缓解 |
|---|---|
| ABAC 引擎选型错（Cedar/CEL/Rego） | MVP 段不依赖此选择；Wave 3 启动前再做 spike，2 周内可切 |
| 决策日志写爆 audit 链 | §4.3 默认只记 deny；提供采样开关；大流量场景前端可用 batch decide 减压 |
| 老 caller 升级新接口工作量 | 重构 PR 一次性做完，依赖 archtest 校验全量迁移 |
| 前端 `can()` 大量同步调用拖慢页面 | 用 batch decide + 客户端 5min 缓存（policy 变更通过 SSE/poll 失效） |

---

## 9. 与其他 BR 的关系

- **不阻塞** BR-001 / BR-002 / BR-003
- §4.1 完成后，前端 `/access/policies?tab=roles` MVP 才能拿到 PDP 数据（之前只能用 `http.auth.role.*` 列表）
- §4.3 上线后，`/access/decisions` 路由从 "Coming soon" 变成实页
