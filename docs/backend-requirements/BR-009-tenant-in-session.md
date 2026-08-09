# BR-009 · 会话响应暴露 `tenantId`（`http.auth.login` / `http.auth.refresh`）

| 字段 | 值 |
|---|---|
| 状态 | 待评审 |
| 优先级 | P1（解锁角色变更端到端；当前前端优雅降级，功能不可用） |
| 阻塞前端 | `/access/policies` 角色 assign/revoke（多租户角色 UX epic）|
| 提出方 | gocell-web |
| 估算 | 0.5 人天（tenant 已在 `sessions.tenant_id`，PR-3b #1678 已落库；仅需透出到响应信封） |
| 涉及 | `accesscore/sessions` slice；改 `contracts/http/auth/{login,refresh}/v1/response.schema.json` |

---

## 1. 背景

后端多租户 epic（#1337）PR-3b（#1678）已为 `http.auth.role.assign.v1` / `http.auth.role.revoke.v1`
请求新增**必填** `tenantId`（uuid），并已在 `sessions.tenant_id` 落库 + auth-path tenant wiring。

但**没有任何会话响应暴露该 tenantId**：`http.auth.login.v1.response` / `http.auth.refresh.v1.response`
的 `data` 仅含 `accessToken / refreshToken / expiresAt / sessionId / userId / passwordResetRequired`，
无 `tenantId`；`http.auth.user.*` 响应也不含。前端因此**无从得知当前会话的租户**，
无法为 role assign/revoke 提供必填的 `tenantId`。

> 前端处理（本仓 #66 / PR #201）：`useAuthStore` 新增 `tenantId: string | null`（会话身份归属地，
> 恒为 `null` 直到本 BR 交付），`usePoliciesStore.assign/revoke` 在调 API 前守门——`tenantId` 为
> `null` 时抛 `TenantUnavailableError` 并展示 inline 文案 `access.policies.errors.tenantUnavailable`，
> **不发请求、不塞伪造值**。后端按本 BR 在响应透出 `tenantId` 后，前端在 `setSession` 填充
> `auth.tenantId`，角色变更即端到端可用，无需改动消费方。与 [BR-005](./BR-005-user-list.md) /
> [BR-004](./BR-004-access-pdp-evolution.md) 同模式（建到 ready，后端落地即接通）。

## 2. 接口规约

在以下两个**已有**响应的 `data` 对象内新增 `tenantId` 字段（其余字段不变）：

### 2.1 `http.auth.login.v1.response` / `http.auth.refresh.v1.response`

`data` 新增：

```json
"tenantId": {
  "type": "string",
  "format": "uuid",
  "description": "Tenant the session is bound to (sessions.tenant_id, epic #1337 PR-3b). Required for tenant-scoped mutations such as role assign/revoke."
}
```

#### 字段约束

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `data.tenantId` | string(uuid) | ✅（建议） | 会话所属租户；与 `role/assign`·`role/revoke` 请求要求的 `tenantId` 同一空间。单租户部署下亦应返回该用户的隐含租户 id。 |

> **必填 vs 可选**：建议设为必填（`required` 含 `tenantId`）——会话必然归属某租户。若后端存在
> tenant-less 系统会话（如 bootstrap），可设为可选并在文档注明空值语义；前端守门逻辑对二者均兼容。

## 3. 验收标准

- [ ] `login` / `refresh` 响应 `data` 含 `tenantId`（uuid），通过更新后的 `response.schema.json` 校验
- [ ] 前端 `pnpm codegen` 后 `HttpAuthLoginV1Response['data']` / `HttpAuthRefreshV1Response['data']` 出现 `tenantId`
- [ ] 前端 `setSession` 填充 `auth.tenantId` 后，`/access/policies` 的 assign/revoke 端到端成功（带正确 tenantId）
- [ ] 单租户与多租户部署下 `tenantId` 取值正确

## 4. 涉及代码区域

- `contracts/http/auth/login/v1/response.schema.json` + `contracts/http/auth/refresh/v1/response.schema.json`（新增 `tenantId`）
- `cells/accesscore/slices/sessions/*`（登录 / 续期 handler 透出 `session.TenantID` 到响应信封）

## 5. 前端联调

后端交付后，前端仅需在 `packages/access/src/stores/useAuthStore.ts` 的 `setSession` 填充：

```typescript
function setSession(payload: SessionData): void {
  // ...existing fields...
  tenantId.value = payload.tenantId
}
```

`usePoliciesStore` / `PoliciesView` 守门逻辑无需改动——`tenantId` 从 `null` 变为真实值后，
`TenantUnavailableError` 路径自然不再触发。
