/**
 * typed-meta.d.ts — Vue Router RouteMeta 类型扩展（T020 Guard 类型化）
 *
 * 用 TS module augmentation 给 RouteMeta 加类型，让 guards.ts 用点访问
 * （to.meta.requiresAuth）替代 bracket 访问（to.meta['requiresAuth']），
 * 消除 unknown 推断。
 *
 * 注意：此文件必须是 ES module（含 export {}），否则 declare module 'vue-router'
 * 会被解析为 ambient module declaration（会遮蔽真实 vue-router 模块），
 * 导致 vue-router 的其他导出全部失效。
 */

// Make this file a proper ES module so the declare module below is a
// module augmentation (not an ambient module declaration).
export {}

declare module 'vue-router' {
  interface RouteMeta {
    /** false 或 true (public) → 不需要认证；未设置默认 true（受保护） */
    requiresAuth?: boolean
    /** true → 与 requiresAuth: false 等效的快捷写法（向后兼容） */
    public?: boolean
    /** PDP gate 所需操作名，如 "read:resource" */
    requiredAction?: string
    /** PDP gate 所需资源名（可选，与 requiredAction 配合使用） */
    requiredResource?: string
  }
}
