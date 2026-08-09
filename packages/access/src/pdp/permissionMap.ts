/**
 * UI (action, resource) → 后端注册权限名映射（PDP adapter）。
 *
 * 前端用细粒度的 (action, resource) 词表表达授权需求（如 action='create'
 * resource='identity'）；后端 PDP 只认注册的权限名，形如 `<domain>:<verb>`
 * （如 `user:write`）。本模块是两者之间的翻译层：把 UI 词表映射到后端真实权限名，
 * 交给 httpDecide 发往 `/decide`。
 *
 * 真相源：后端 `../gocell/framework/pkg/authz/permission.go` 的 `allPermissions`。
 * 新增 `<Can>` 动作或路由 meta 资源时，若后端有对应权限须在此登记；否则走 fail-closed。
 *
 * 设计：
 * - 资源域名对齐：前端 `identity`→后端 `user`、`cell`→`system`，其余同名。
 * - 动作粒度收敛：后端权限词表更粗（多数 read/write + 个别 config:publish/delete、
 *   audit:export）。前端写类动作（create/update/delete/lock/unlock/change-password）
 *   统一落到该域 `:write`；`verify`（审计链校验）落 `audit:read`（读侧完整性检查，后端
 *   无独立 verify 权限）；`rollback` / flag `delete` 落对应域 `:write`。
 * - 未登记的 (resource, action) → best-effort 拼 `${resource}:${action}`，后端未注册该
 *   权限 → 400 → createPdpClient 链路 fail-closed deny（安全兜底）。`role` 的 assign/revoke
 *   即走此路径：后端是 cell 内部路由（RequireCallerCell），无面向用户的权限 → 浏览器端
 *   不可达 → fail-closed 隐藏，符合诚实建模。
 */
const PERMISSION_MAP: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  identity: {
    read: 'user:read',
    create: 'user:write',
    update: 'user:write',
    delete: 'user:write',
    lock: 'user:write',
    unlock: 'user:write',
    'change-password': 'user:write',
  },
  policy: {
    read: 'policy:read',
    create: 'policy:write',
    update: 'policy:write',
    delete: 'policy:write',
    write: 'policy:write',
  },
  audit: {
    read: 'audit:read',
    verify: 'audit:read',
  },
  config: {
    read: 'config:read',
    write: 'config:write',
    publish: 'config:publish',
    delete: 'config:delete',
    rollback: 'config:write',
  },
  flag: {
    read: 'flag:read',
    write: 'flag:write',
    delete: 'flag:write',
  },
  cell: {
    read: 'system:read',
  },
  role: {
    read: 'role:read',
  },
}

/**
 * 把 UI (action, resource) 翻译成后端注册的权限名。
 * - 命中映射表 → 返回登记的权限名；
 * - 未命中但有 resource → best-effort `${resource}:${action}`（后端拒绝 → fail-closed）；
 * - 无 resource → action 已是权限名（或后端将拒绝），原样透传。
 */
export function toPermission(action: string, resource: string | undefined): string {
  if (resource === undefined) return action
  return PERMISSION_MAP[resource]?.[action] ?? `${resource}:${action}`
}
