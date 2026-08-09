import { describe, it, expect, vi } from 'vitest'
import { createApp } from 'vue'
import { defineStore } from 'pinia'
import { createTestPinia, createTestRouter } from './index'

describe('createTestPinia', () => {
  it('returns a usable pinia instance', () => {
    const pinia = createTestPinia({ createSpy: vi.fn })

    const useTestStore = defineStore('test.counter', {
      state: () => ({ count: 0 }),
      actions: {
        increment() {
          this.count++
        },
      },
    })

    const app = createApp({ template: '<div/>' })
    app.use(pinia)
    const store = useTestStore()
    expect(store.count).toBe(0)

    // stubActions:false — action 真实执行
    store.increment()
    expect(store.count).toBe(1)
  })

  it('respects opts override (stubActions:true)', () => {
    const pinia = createTestPinia({ stubActions: true, createSpy: vi.fn })
    const useStore = defineStore('test.stubbed', {
      state: () => ({ value: 0 }),
      actions: {
        set(v: number) {
          this.value = v
        },
      },
    })
    const app = createApp({ template: '<div/>' })
    app.use(pinia)
    const store = useStore()
    store.set(42) // stub — no-op
    expect(store.value).toBe(0)
  })
})

describe('createTestRouter', () => {
  it('returns a router with default route / configuration', () => {
    const router = createTestRouter()
    expect(router).toBeDefined()
    // 内存路由初始路径 /
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('accepts custom routes', () => {
    // 验证路由对象可用自定义 routes 构建，不验证导航（需要 app mount）
    const routes = [
      { path: '/', component: { template: '<div/>' } },
      { path: '/about', component: { template: '<div/>' } },
    ]
    const router = createTestRouter(routes)
    expect(router).toBeDefined()
    // 路由表包含 /about
    const hasAbout = router.getRoutes().some((r) => r.path === '/about')
    expect(hasAbout).toBe(true)
  })
})
