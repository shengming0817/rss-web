# BR-005 · 用户主体列表端点（`http.auth.user.list`）

| 字段 | 值 |
|---|---|
| 状态 | 待评审 |
| 优先级 | P1（MVP 阻塞 `/access/identities` 列表页） |
| 阻塞前端 | Batch 2 · Access · Identities 列表（PR-09） |
| 提出方 | gocell-web |
| 估算 | 0.5–1 人天（service 已有 repo，复用 audit/role list 分页约定） |
| 涉及 | `accesscore/identitymanage` slice；新增 `contracts/http/auth/user/list/v1/` |

---

## 1. 背景

PRD §228 与 `specs/001-gocell-web-mvp/tasks.md` T200/T202 约定 `http.auth.user.*` 为 **9 个契约**
（list/create/get/update/patch/delete/lock/unlock/change-password）。前端核对后端现状（代码真值源）：

```
cells/accesscore/cell_gen.go        → mux.Route("/users", identityHandler.RegisterRoutes)
cells/accesscore/slices/identitymanage/handler.go:268 RegisterRoutes
  → create / get / update / patch / delete / lock / unlock / change-password  （8 个）
```

**`list` 未注册、`contracts/http/auth/user/list/v1/` 不存在。** 第 9 个契约缺失，Identities 列表页无数据源。

> 前端处理：PR-09 先按本 BR 约定的 `GET /api/v1/access/users` 形状实现 store / api / 列表页，
> list 信封类型以本地 provisional 类型桥接（标注 `BR-005 pending`）。后端按本 BR 交付 schema 后，
> 前端 `pnpm codegen` 派生 `HttpAuthUserListV1Response`，删除 provisional 类型切换至真实契约。
> 与 [BR-004](./BR-004-access-pdp-evolution.md) PDP fail-closed stub 同模式（建到 ready，后端落地即接通）。

## 2. 接口规约

### 2.1 `GET /api/v1/access/users`

**Auth**：JWT Bearer，role=admin（与 `/users` 其余写操作一致）
**Cell 归属**：`accesscore/identitymanage`（复用现有 `/users` 路由组与 `Service.repo`）
**Success status**：200
**分页约定**：cursor-based，**与 `http.audit.list.v1` / `http.auth.role.list.v1` 完全一致**（`nextCursor` + `hasMore`）——前端列表分页组件按此统一约定实现。

#### Query Params

| 参数 | 类型 | 必填 | 约束 | 说明 |
|---|---|---|---|---|
| `cursor` | string | ❌ | maxLength 4096 | 上一页 `nextCursor`；首页省略 |
| `limit` | integer | ❌ | 1–500（默认 50） | 单页条数 |

> **筛选（quick filter）**：MVP 前端按用户名 / 邮箱**客户端**子串过滤当前已加载页，
> 不依赖服务端筛选参数（避免猜测后端参数名）。后端如愿提供服务端筛选，建议加 `q`（用户名/邮箱模糊）
> 与 `status`（`active` / `locked`）两个可选 query param；前端将在后端确认后切换为服务端筛选（非 MVP 阻塞项）。

#### Response Schema（`response.schema.json`）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "http.auth.user.list.v1.response",
  "type": "object",
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "username": { "type": "string" },
          "email": { "type": "string" },
          "status": { "type": "string" },
          "createdAt": { "type": "string", "format": "date-time" },
          "updatedAt": { "type": "string", "format": "date-time" }
        },
        "required": ["id", "username", "email", "status", "createdAt", "updatedAt"]
      }
    },
    "nextCursor": { "type": "string" },
    "hasMore": { "type": "boolean" }
  },
  "required": ["data", "nextCursor", "hasMore"]
}
```

> 行字段与 `http.auth.user.get.v1.response.data` **逐字段一致**（id/username/email/status/createdAt/updatedAt）——
> 前端 list 行类型直接复用 `HttpAuthUserGetV1Response['data']`，仅 list 信封为新增。

#### 字段约束

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `data[].status` | string | ✅ | 与 get/patch 返回的 `status` 同枚举（MVP 观察值：`active` / `locked`；以后端为准） |
| `nextCursor` | string | ✅ | 无下一页时为空串 `""`（同 audit/role list 约定） |
| `hasMore` | boolean | ✅ | 是否还有下一页 |

#### 错误码（统一 envelope `shared/errors/error-response-v1.schema.json`）

| Status | code | 说明 |
|---|---|---|
| 400 | ERR_VALIDATION | cursor / limit 格式非法 |
| 401 | ERR_AUTH_REQUIRED | 未携带 token 或 token 无效 |
| 403 | ERR_AUTH_FORBIDDEN | token 有效但角色非 admin |
| 500 | ERR_INTERNAL | 列表查询异常 |

## 3. 验收标准

- [ ] 端点返回 JSON 通过新增 `contracts/http/auth/user/list/v1/response.schema.json` 校验
- [ ] 分页约定与 audit/role list 一致（`nextCursor` 空串语义 + `hasMore`）
- [ ] `limit` 越界（<1 或 >500）/ 非法 cursor → 400 ERR_VALIDATION
- [ ] 401/403 错误路径有单测
- [ ] 前端 `pnpm codegen` 后产出 `HttpAuthUserListV1Response`，且与本 BR §2.1 信封一致

## 4. 演进路径

- **MVP**：实现 2.1 cursor 分页 + 客户端筛选；行字段对齐 `user.get`
- **Wave 2**：服务端 `q` / `status` 筛选 + 排序（`sort=createdAt:desc`）；前端切换为服务端筛选
- **Wave 3**：`type` 字段（`user` / `service-account` / `cell`）落库后纳入 list，解锁 Service accounts tab（当前前端为 disabled 占位，FR-030）

## 5. 涉及代码区域

- 新增 `contracts/http/auth/user/list/v1/contract.yaml` + `response.schema.json`
- `cells/accesscore/slices/identitymanage/handler.go`（新增 ListAdapter + RegisterRoutes 挂载）
- `cells/accesscore/slices/identitymanage/service.go`（新增 `List(ctx, cursor, limit)`，复用 `repo`）
- `cells/accesscore/internal/ports/*_repo.go` / `internal/adapters/postgres/user_repo.go`（如 repo 尚无 List）

## 6. 前端联调

前端调用代码（PR-09，provisional 类型 → 后端交付后切 `@gocell/contracts`）：

```typescript
// packages/access/src/api/identities.ts
export const USERS_URL = '/api/v1/access/users'

// BR-005 pending: 后端交付 user.list schema 后删除本地类型，改 import HttpAuthUserListV1Response
export async function listUsers(params: { cursor?: string; limit?: number }): Promise<UserListPage> {
  const res = await http.get<UserListResponse>(USERS_URL, { params })
  return res.data
}
```

前端不轮询（用户列表非实时）；写操作（create/lock/unlock/...）成功后手动 refetch 当前页。
