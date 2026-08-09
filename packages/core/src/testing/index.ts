/**
 * @gocell/core/testing — 测试工具（仅在测试代码中引用，不进入 production bundle）
 *
 * 提供：
 * - createTestPinia: 基于 @pinia/testing createTestingPinia 的工厂，统一默认配置
 * - createTestRouter: 内存路由，用于组件单测
 *
 * 使用：
 *   import { vi } from 'vitest'
 *   import { createTestPinia, createTestRouter } from '@gocell/core/testing'
 *   const pinia = createTestPinia({ createSpy: vi.fn })
 */

import { createTestingPinia } from '@pinia/testing'
import type { TestingOptions } from '@pinia/testing'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { Router, RouteRecordRaw } from 'vue-router'

/**
 * Pinia 测试工厂。
 *
 * 注意：必须传入 `createSpy: vi.fn`（来自 vitest）。
 *
 * 默认 stubActions: false——与 @pinia/testing 的默认值（stubActions: true）相反。
 * 本封装默认 false 以测试真实 action 行为，使行为测试更接近生产路径。
 * 若需 stub action（例如隔离副作用），显式传入 { stubActions: true }。
 *
 * @example
 *   import { vi } from 'vitest'
 *   const pinia = createTestPinia({ createSpy: vi.fn })
 *
 * @example 显式 stub actions
 *   const pinia = createTestPinia({ createSpy: vi.fn, stubActions: true })
 */
export function createTestPinia(opts: TestingOptions) {
  return createTestingPinia({
    stubActions: false,
    ...opts,
  })
}

/** 内存路由工厂 — 组件单测用，避免依赖真实 history API */
export function createTestRouter(routes?: RouteRecordRaw[]): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: routes ?? [{ path: '/', component: { template: '<div />' } }],
  })
}
