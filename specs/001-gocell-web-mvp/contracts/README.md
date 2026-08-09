# Frontend ↔ Backend Contract Mapping

> 前端不定义契约；契约真相在 `../gocell/contracts/http/**/*.schema.json`。
> 本表把前端页面/能力映射到后端契约与 codegen 派生类型（`@gocell/contracts`）。

| 前端能力 | 包 | 后端 URL | 后端 slice | 派生类型（示例） |
|---|---|---|---|---|
| First-run status | access | `GET /api/v1/access/setup/status` | accesscore/setup | `HttpAuthSetupStatus*` |
| First-run admin | access | `POST /api/v1/access/setup/admin` | accesscore/setup | `HttpAuthSetupAdmin*` |
| Login | access | `POST /api/v1/access/sessions/login` | sessionlogin | `HttpAuthSessionLogin*` |
| Refresh | access | `POST /api/v1/access/sessions/refresh` | sessionrefresh | `HttpAuthSessionRefresh*` |
| Logout | access | `DELETE /api/v1/access/sessions/...` | sessionlogout | `HttpAuthSessionLogout*` |
| User CRUD | access | `.../access/users/...`（9 个） | identitymanage | `HttpAuthUser{List,Get,Create,Update,Patch,Delete,Lock,Unlock,ChangePassword}*` |
| Role mgmt | access | `.../access/roles/...` | rbaccheck/rbacassign | `HttpAuthRole{List,Check,Assign,Revoke}*` |
| PDP decide | access | `POST /api/v1/access/decide` | authorizationdecide（BR-004 §4.1，待暴露 HTTP） | `HttpAccessDecide*` |
| Audit query | audit | `GET /api/v1/audit/...` | auditquery | `HttpAuditQuery*` |
| Config CRUD | config | `.../config/entries/...` | configread/configwrite | `HttpConfig{List,Get,Write,Update,Delete}*` |
| Config publish/rollback | config | `POST /api/v1/config/{publish,rollback}` | configpublish | `HttpConfig{Publish,Rollback}*` |
| Feature flags | config | `.../config/flags/...` | featureflag/flagwrite | `HttpConfigFlag{List,Get,Create,Update,Delete,Toggle,Evaluate}*` |
| Cell health | observability | `GET /api/v1/admin/health/cells`（BR-001，待交付） | — | `HttpAdminHealthCells*` |
| System info | observability | `GET /api/v1/admin/system`（BR-002，待交付） | — | `HttpAdminSystem*` |
| Observability | observability | LGTM（BR-003，待交付） | — | — |
| Error envelope | shared/request | `shared/errors/error-response-v1.schema.json` | pkg/errcode | `ErrorResponseV1` |

## 待后端确认 / 新增（登记到 BR）
- `POST /api/v1/access/decide`（BR-004 §4.1）— 阻塞 Batch 3 `<Can>` 实数据。
- `GET /api/v1/admin/health/cells`（BR-001）/ `GET /api/v1/admin/system`（BR-002）— 阻塞 Batch 7。
- LGTM stack + OTLP（BR-003）— 阻塞 Batch 7 `/observe`。
- refresh token 是否下发 httpOnly cookie（影响存储策略，research §7.1）。
- `/cells` 是否新增 `GET /api/v1/admin/cells`（MVP 先静态派生 cell.yaml）。

## codegen 约定
`tools/codegen/` glob `../gocell/contracts/http/**/*.schema.json` → json2ts → `packages/contracts/src/`，
按 namespace（auth/config/audit）分文件 + `index.ts` barrel；`pnpm codegen`；CI `git diff --exit-code packages/contracts/src/`。
